import "server-only";
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { env } from "./env";
import { allow } from "./guard/ratelimit";
import { deliveryStatus, maskedPhone, normalizePhone, sendWhatsApp } from "./whatsapp";

/**
 * Verify a user's own WhatsApp number: LifeCart sends a 6-digit code to it over WhatsApp, the user types it back.
 * Proves the number is theirs AND that it has joined the Twilio sandbox (otherwise the code can't arrive).
 * Codes are stored hashed, expire in 10 minutes, allow 5 tries; sending is rate limited per user.
 */
const TTL_MS = 10 * 60_000;
const MAX_TRIES = 5;
const NOT_JOINED = [63007, 63015, 63016];

const digest = (userId: string, phone: string, code: string) =>
  createHmac("sha256", env.approvalSecret ?? "lifecart-dev-only").update(`${userId}:${phone}:${code}`).digest("hex");

export async function startPhoneVerification(userId: string, raw: unknown): Promise<{ ok: true; masked: string } | { error: string }> {
  const phone = normalizePhone(raw);
  if (!phone) return { error: "Enter your WhatsApp number with country code, like +1 415 555 0142." };
  if (!allow(`phone-code:${userId}`, 5, 60 * 60_000).ok) return { error: "Too many codes requested. Try again in a little while." };

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const db = await getDb();
  await db
    .update(schema.users)
    .set({ pendingPhone: phone, phoneCodeHash: digest(userId, phone, code), phoneCodeExpiresAt: new Date(Date.now() + TTL_MS), phoneCodeAttempts: 0 })
    .where(eq(schema.users.id, userId));

  const sent = await sendWhatsApp(`*LifeCart* verification code: *${code.slice(0, 3)} ${code.slice(3)}*\n\nEnter it on LifeCart to get your alerts here. It expires in 10 minutes.`, phone);
  if (!sent.sent) return { error: sent.reason };

  // Twilio accepts first and fails delivery a moment later for numbers that haven't joined: check briefly.
  for (const wait of [2500, 3500]) {
    await new Promise((r) => setTimeout(r, wait));
    const s = await deliveryStatus(sent.sid);
    if (s.code && NOT_JOINED.includes(s.code)) return { error: "That number hasn't joined LifeCart on WhatsApp yet. Send the join message first (step 1), then try again." };
    if (["failed", "undelivered"].includes(s.status)) return { error: "WhatsApp couldn't deliver the code. Check the number and that you've sent the join message." };
    if (["delivered", "read"].includes(s.status)) break;
  }
  return { ok: true, masked: maskedPhone(phone)! };
}

export async function confirmPhone(userId: string, rawCode: unknown): Promise<{ ok: true; masked: string } | { error: string }> {
  const code = typeof rawCode === "string" ? rawCode.replace(/\D/g, "") : "";
  if (code.length !== 6) return { error: "Enter the 6-digit code from WhatsApp." };
  const db = await getDb();
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!u?.pendingPhone || !u.phoneCodeHash || !u.phoneCodeExpiresAt || u.phoneCodeExpiresAt < new Date()) return { error: "That code has expired. Send a new one." };
  if (u.phoneCodeAttempts >= MAX_TRIES) return { error: "Too many wrong tries. Send a new code." };

  const a = Buffer.from(digest(userId, u.pendingPhone, code));
  const b = Buffer.from(u.phoneCodeHash);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    await db.update(schema.users).set({ phoneCodeAttempts: u.phoneCodeAttempts + 1 }).where(eq(schema.users.id, userId));
    const left = MAX_TRIES - u.phoneCodeAttempts - 1;
    return { error: left > 0 ? `That code isn't right. ${left} ${left === 1 ? "try" : "tries"} left.` : "Too many wrong tries. Send a new code." };
  }
  await db
    .update(schema.users)
    .set({ phone: u.pendingPhone, phoneVerifiedAt: new Date(), whatsappOptIn: true, pendingPhone: null, phoneCodeHash: null, phoneCodeExpiresAt: null, phoneCodeAttempts: 0 })
    .where(eq(schema.users.id, userId));
  return { ok: true, masked: maskedPhone(u.pendingPhone)! };
}

export async function removePhone(userId: string) {
  const db = await getDb();
  await db
    .update(schema.users)
    .set({ phone: null, phoneVerifiedAt: null, whatsappOptIn: false, pendingPhone: null, phoneCodeHash: null, phoneCodeExpiresAt: null, phoneCodeAttempts: 0 })
    .where(eq(schema.users.id, userId));
}
