import { env } from "./env";
import { canSpend, record, withTimeout } from "./usage";

/**
 * WhatsApp via the Twilio sandbox (Meta Cloud API sign-up was blocked). Messages carry a tappable link.
 * Every message goes to ONE user's own verified number; nothing is sent to anyone who hasn't verified.
 * Sandbox rules: a number must first send the join phrase to the sandbox number (opt-in lapses after ~3 days
 * without activity), and WhatsApp only allows free-form messages within 24 hours of the user's last message.
 */
export type SendResult = { sent: true; sid: string } | { sent: false; reason: string };

/** Twilio's shared sandbox number (the "From" when TWILIO_FROM is the sandbox). */
export const SANDBOX_NUMBER = "+14155238886";

/** "join <two-words>" from the Twilio console; shown to users so they can opt in. */
export const sandboxJoin = () => env.twilioSandboxJoin ?? null;

/** wa.me link that opens WhatsApp with the join message typed, ready to send. */
export const joinLink = () => {
  const join = sandboxJoin();
  const from = (env.twilioFrom ?? `whatsapp:${SANDBOX_NUMBER}`).replace(/\D/g, "");
  return join ? `https://wa.me/${from}?text=${encodeURIComponent(join)}` : null;
};

/** "+1 (415) 555-0142", "415 555 0142", "+44 7700 900123" -> E.164, or null. 10 digits are read as US. */
export function normalizePhone(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, "");
  const e164 = trimmed.startsWith("+") ? `+${digits}` : digits.length === 10 ? `+1${digits}` : digits.length === 11 && digits.startsWith("1") ? `+${digits}` : null;
  return e164 && /^\+[1-9]\d{7,14}$/.test(e164) ? e164 : null;
}

/** The number to alert, only if the user verified it. */
export const alertNumber = (user: { phone: string | null; phoneVerifiedAt: Date | null } | null | undefined) =>
  user?.phone && user.phoneVerifiedAt ? user.phone : null;

/** Last 4 digits for display. */
export const maskedPhone = (phone: string | null | undefined) => {
  const d = phone?.replace(/\D/g, "") ?? "";
  return d ? `···${d.slice(-4)}` : null;
};

export async function sendWhatsApp(body: string, to: string | null): Promise<SendResult> {
  if (!to) return { sent: false, reason: "No verified WhatsApp number (add one in your profile)" };
  if (!env.twilioSid || !env.twilioToken || !env.twilioFrom) return { sent: false, reason: "WhatsApp isn't connected" };
  if (!(await canSpend("twilio", { calls: 1 }))) return { sent: false, reason: "Today's WhatsApp message budget is used up" };

  const from = env.twilioFrom.startsWith("whatsapp:") ? env.twilioFrom : `whatsapp:${env.twilioFrom}`;
  const form = new URLSearchParams({ From: from, To: `whatsapp:${to}`, Body: body.slice(0, 1500) });
  await record("twilio", { calls: 1 });
  try {
    const res = await withTimeout(
      fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.twilioSid}/Messages.json`, {
        method: "POST",
        headers: { Authorization: "Basic " + Buffer.from(`${env.twilioSid}:${env.twilioToken}`).toString("base64") },
        body: form,
      }),
      15_000,
      "WhatsApp send",
    );
    const data = (await res.json().catch(() => ({}))) as { sid?: string; message?: string; code?: number };
    if (!res.ok || !data.sid) {
      // 63015/63016/63007: the number hasn't joined the sandbox, or the 24-hour window closed.
      const notJoined = [63007, 63015, 63016].includes(data.code ?? 0);
      return { sent: false, reason: notJoined ? "That number hasn't joined LifeCart on WhatsApp yet (send the join message first)" : "WhatsApp didn't accept the message" };
    }
    return { sent: true, sid: data.sid };
  } catch {
    return { sent: false, reason: "WhatsApp didn't respond in time" };
  }
}

/**
 * Twilio accepts a message before WhatsApp delivers it; an unjoined number fails a moment later. Check the
 * delivery status briefly so verification can say "not joined yet" instead of waiting for a code that won't come.
 */
export async function deliveryStatus(sid: string): Promise<{ status: string; code: number | null }> {
  if (!env.twilioSid || !env.twilioToken) return { status: "unknown", code: null };
  try {
    const res = await withTimeout(
      fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.twilioSid}/Messages/${sid}.json`, {
        headers: { Authorization: "Basic " + Buffer.from(`${env.twilioSid}:${env.twilioToken}`).toString("base64") },
      }),
      10_000,
      "WhatsApp status",
    );
    const d = (await res.json().catch(() => ({}))) as { status?: string; error_code?: number | null };
    return { status: d.status ?? "unknown", code: d.error_code ?? null };
  } catch {
    return { status: "unknown", code: null };
  }
}
