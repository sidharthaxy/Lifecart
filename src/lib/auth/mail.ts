import "server-only";
import nodemailer from "nodemailer";
import { env } from "../env";

/**
 * Sign-in emails through Gmail SMTP with an app password (GMAIL_USER + GMAIL_APP_PASSWORD).
 * In local development without those set, the code is printed to the server console instead.
 */
let transport: nodemailer.Transporter | null = null;

export const mailConfigured = () => Boolean(env.gmailUser && env.gmailAppPassword);

export async function sendSignInCode(to: string, code: string): Promise<{ sent: true } | { sent: false; reason: string }> {
  if (!mailConfigured()) {
    if (process.env.NODE_ENV !== "production") {
      console.log(`\n[auth] Sign-in code for ${to}: ${code}  (set GMAIL_USER and GMAIL_APP_PASSWORD to email it)\n`);
      return { sent: true };
    }
    return { sent: false, reason: "Email sign-in isn't set up on this server yet." };
  }
  transport ??= nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user: env.gmailUser, pass: env.gmailAppPassword },
    connectionTimeout: 10_000,
    socketTimeout: 15_000,
  });
  const spaced = `${code.slice(0, 3)} ${code.slice(3)}`;
  try {
    await transport.sendMail({
      from: { name: "LifeCart", address: env.gmailUser! },
      to,
      subject: `${spaced} is your LifeCart sign-in code`,
      text: `Your LifeCart sign-in code is ${spaced}.\n\nIt works once and expires in 10 minutes. If you didn't ask for it, you can ignore this email.`,
      html: `<div style="font-family:system-ui,sans-serif;max-width:420px;margin:auto;padding:24px;color:#0E1726">
  <p style="font-size:18px;font-weight:700;margin:0 0 16px">LifeCart</p>
  <p style="margin:0 0 8px">Your sign-in code:</p>
  <p style="font-size:32px;font-weight:800;letter-spacing:6px;margin:0 0 16px">${spaced}</p>
  <p style="color:#4A5468;font-size:14px;margin:0">It works once and expires in 10 minutes. If you didn't ask for it, you can ignore this email.</p>
</div>`,
    });
    return { sent: true };
  } catch (e) {
    console.error("[auth] email send failed:", (e as Error).message);
    return { sent: false, reason: "We couldn't send the email right now. Try again in a minute." };
  }
}
