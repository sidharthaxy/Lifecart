import "server-only";
import nodemailer from "nodemailer";
import { env } from "../env";

/**
 * Sign-in emails. Two ways to send, picked by which keys are set:
 *   BREVO_API_KEY (+ MAIL_FROM)        Brevo's HTTPS API. Use this on Render's free tier, which blocks SMTP ports.
 *   GMAIL_USER + GMAIL_APP_PASSWORD    Gmail SMTP with an app password (fine locally and on paid hosts).
 * In local development with neither set, the code is printed to the server console instead.
 */
let transport: nodemailer.Transporter | null = null;

const brevoReady = () => Boolean(env.brevoApiKey && env.mailFrom);
export const mailConfigured = () => brevoReady() || Boolean(env.gmailUser && env.gmailAppPassword);

/** Reserved test domains (RFC 2606) are never emailed: dev test scripts use them, and real mail would bounce. */
const isTestAddress = (to: string) => /@(example\.(com|net|org)|[^@]+\.(test|invalid|example))$/i.test(to);

export async function sendSignInCode(to: string, code: string): Promise<{ sent: true } | { sent: false; reason: string }> {
  if (!mailConfigured() || isTestAddress(to)) {
    if (process.env.NODE_ENV !== "production") {
      console.log(`\n[auth] Sign-in code for ${to}: ${code}  (set BREVO_API_KEY or GMAIL_USER + GMAIL_APP_PASSWORD to email it)\n`);
      return { sent: true };
    }
    return { sent: false, reason: "Email sign-in isn't set up on this server yet." };
  }
  const spaced = `${code.slice(0, 3)} ${code.slice(3)}`;
  const subject = `${spaced} is your LifeCart sign-in code`;
  const text = `Your LifeCart sign-in code is ${spaced}.\n\nIt works once and expires in 10 minutes. If you didn't ask for it, you can ignore this email.`;
  const html = `<div style="font-family:system-ui,sans-serif;max-width:420px;margin:auto;padding:24px;color:#0E1726">
  <p style="font-size:18px;font-weight:700;margin:0 0 16px">LifeCart</p>
  <p style="margin:0 0 8px">Your sign-in code:</p>
  <p style="font-size:32px;font-weight:800;letter-spacing:6px;margin:0 0 16px">${spaced}</p>
  <p style="color:#4A5468;font-size:14px;margin:0">It works once and expires in 10 minutes. If you didn't ask for it, you can ignore this email.</p>
</div>`;
  try {
    if (brevoReady()) {
      const res = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: { "api-key": env.brevoApiKey!, "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          sender: { name: "LifeCart", email: env.mailFrom },
          to: [{ email: to }],
          subject,
          textContent: text,
          htmlContent: html,
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`Brevo ${res.status}: ${(await res.text()).slice(0, 300)}`);
      return { sent: true };
    }
    transport ??= nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: env.gmailUser, pass: env.gmailAppPassword },
      connectionTimeout: 10_000,
      socketTimeout: 15_000,
    });
    await transport.sendMail({ from: { name: "LifeCart", address: env.gmailUser! }, to, subject, text, html });
    return { sent: true };
  } catch (e) {
    console.error("[auth] email send failed:", (e as Error).message);
    return { sent: false, reason: "We couldn't send the email right now. Try again in a minute." };
  }
}
