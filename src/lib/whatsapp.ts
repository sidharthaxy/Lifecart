import { env } from "./env";
import { canSpend, record, withTimeout } from "./usage";

/**
 * WhatsApp via the Twilio sandbox (Meta Cloud API sign-up was blocked). Messages carry a tappable link.
 * If Twilio isn't configured or today's cap is reached, returns { sent: false } and the UI shows a phone preview.
 */
export type SendResult = { sent: true; sid: string } | { sent: false; reason: string };

export async function sendWhatsApp(body: string): Promise<SendResult> {
  const to = env.demoWhatsappTo?.replace(/\D/g, "");
  if (!env.twilioSid || !env.twilioToken || !env.twilioFrom || !to) return { sent: false, reason: "WhatsApp isn't connected" };
  if (!(await canSpend("twilio", { calls: 1 }))) return { sent: false, reason: "Today's WhatsApp message budget is used up" };

  const from = env.twilioFrom.startsWith("whatsapp:") ? env.twilioFrom : `whatsapp:${env.twilioFrom}`;
  const form = new URLSearchParams({ From: from, To: `whatsapp:+${to}`, Body: body.slice(0, 1500) });
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
      // 63016 / 63015: recipient hasn't joined the sandbox or the 24h window closed.
      const hint = data.code === 63015 || data.code === 63016 ? " (send the sandbox join code again from your phone)" : "";
      return { sent: false, reason: `WhatsApp didn't accept the message${hint}` };
    }
    return { sent: true, sid: data.sid };
  } catch {
    return { sent: false, reason: "WhatsApp didn't respond in time" };
  }
}

/** Last 4 digits for display. */
export const maskedPhone = () => {
  const d = env.demoWhatsappTo?.replace(/\D/g, "") ?? "";
  return d ? `···${d.slice(-4)}` : null;
};
