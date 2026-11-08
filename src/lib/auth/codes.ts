import "server-only";
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { env } from "../env";
import { allow } from "../guard/ratelimit";
import { sendSignInCode } from "./mail";

const CODE_TTL_MS = 10 * 60_000;
const MAX_ATTEMPTS = 5;
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,24}$/i;

export const normalizeEmail = (v: unknown) => (typeof v === "string" ? v.trim().toLowerCase().slice(0, 254) : "");
export const isEmail = (e: string) => EMAIL_RE.test(e);

const digest = (email: string, code: string) =>
  createHmac("sha256", env.approvalSecret ?? "lifecart-dev-only").update(`${email}:${code}`).digest("hex");

/** Email a 6-digit code. Rate limited per email and per client; older unused codes stop working. */
export async function requestCode(emailRaw: unknown, client: string): Promise<{ ok: true; email: string } | { error: string }> {
  const email = normalizeEmail(emailRaw);
  if (!isEmail(email)) return { error: "Enter a valid email address." };
  if (!allow(`code:${email}`, 5, 60 * 60_000).ok || !allow(`code-ip:${client}`, 15, 60 * 60_000).ok)
    return { error: "Too many codes requested. Try again in a little while." };

  const db = await getDb();
  await db.update(schema.authCodes).set({ usedAt: new Date() }).where(and(eq(schema.authCodes.email, email), isNull(schema.authCodes.usedAt)));
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await db.insert(schema.authCodes).values({ email, codeHash: digest(email, code), expiresAt: new Date(Date.now() + CODE_TTL_MS) });
  const sent = await sendSignInCode(email, code);
  if (!sent.sent) return { error: sent.reason };
  return { ok: true, email };
}

/** Check a code. On success returns the user (created on first sign-in). */
export async function verifyCode(emailRaw: unknown, codeRaw: unknown, client: string): Promise<{ userId: string; isNew: boolean } | { error: string }> {
  const email = normalizeEmail(emailRaw);
  const code = typeof codeRaw === "string" ? codeRaw.replace(/\D/g, "") : "";
  if (!isEmail(email) || code.length !== 6) return { error: "Enter the 6-digit code from the email." };
  if (!allow(`verify-ip:${client}`, 30, 60 * 60_000).ok) return { error: "Too many attempts. Try again in a little while." };

  const db = await getDb();
  const [row] = await db
    .select()
    .from(schema.authCodes)
    .where(and(eq(schema.authCodes.email, email), isNull(schema.authCodes.usedAt), gt(schema.authCodes.expiresAt, new Date())))
    .orderBy(desc(schema.authCodes.createdAt))
    .limit(1);
  if (!row) return { error: "That code has expired. Ask for a new one." };
  if (row.attempts >= MAX_ATTEMPTS) return { error: "Too many wrong tries. Ask for a new code." };

  const a = Buffer.from(digest(email, code));
  const b = Buffer.from(row.codeHash);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    await db.update(schema.authCodes).set({ attempts: row.attempts + 1 }).where(eq(schema.authCodes.id, row.id));
    const left = MAX_ATTEMPTS - row.attempts - 1;
    return { error: left > 0 ? `That code isn't right. ${left} ${left === 1 ? "try" : "tries"} left.` : "Too many wrong tries. Ask for a new code." };
  }
  // Single use: claim it atomically so a replay can't sign in twice.
  const claimed = await db
    .update(schema.authCodes)
    .set({ usedAt: new Date() })
    .where(and(eq(schema.authCodes.id, row.id), isNull(schema.authCodes.usedAt)))
    .returning();
  if (!claimed.length) return { error: "That code was already used. Ask for a new one." };

  const [existing] = await db.select().from(schema.users).where(eq(schema.users.email, email));
  if (existing) {
    if (!existing.emailVerifiedAt) await db.update(schema.users).set({ emailVerifiedAt: new Date() }).where(eq(schema.users.id, existing.id));
    return { userId: existing.id, isNew: false };
  }
  const [created] = await db
    .insert(schema.users)
    .values({ email, emailVerifiedAt: new Date(), prefs: { alertPriceDrops: true, alertBills: true, payInParts: true } })
    .returning();
  return { userId: created.id, isNew: true };
}
