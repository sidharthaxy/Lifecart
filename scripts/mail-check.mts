// Dev tool: check the Gmail SMTP login works (connects and authenticates, sends nothing).
// Usage: npx tsx --env-file=.env.local scripts/mail-check.mts
import nodemailer from "nodemailer";
const user = process.env.GMAIL_USER?.trim();
const pass = process.env.GMAIL_APP_PASSWORD?.replace(/\s+/g, "");
if (!user || !pass) throw new Error("GMAIL_USER / GMAIL_APP_PASSWORD missing");
const t = nodemailer.createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user, pass }, connectionTimeout: 10_000 });
try {
  await t.verify();
  console.log("Gmail SMTP login OK");
} catch (e) {
  console.log("Gmail SMTP login FAILED:", (e as Error).message.split("\n")[0]);
}
