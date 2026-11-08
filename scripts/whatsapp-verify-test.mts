// Dev tool: WhatsApp number verification in the browser (reuses the coupons.test account).
//  1) a number that never joined the sandbox is refused with a clear message
//  2) DEMO_WHATSAPP_TO (a number that HAS joined) gets a code: sends ONE real WhatsApp message to it; the test reads
//     the code back from Twilio's message log, verifies, then removes the number again.
// Usage: npx tsx --env-file=.env.local scripts/whatsapp-verify-test.mts <devServerLogFile> <outDir>
import puppeteer, { type Page } from "puppeteer-core";
import { CHROME, signInPage } from "./lib/test-session.mjs";

const [logFile, out = "."] = process.argv.slice(2);
const base = "http://localhost:3000";
const ok = (cond: boolean, what: string) => console.log(`${cond ? "PASS" : "FAIL"}  ${what}`);
const sid = process.env.TWILIO_ACCOUNT_SID!;
const auth = "Basic " + Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64");
const mine = "+" + (process.env.DEMO_WHATSAPP_TO ?? "").replace(/\D/g, "");
const section = "section[aria-labelledby=wa]";
const text = (p: Page) => p.$eval(section, (s) => (s as HTMLElement).innerText);
const press = async (p: Page, value: string) => {
  await p.click(`${section} button[value=${value}]`);
  await p.waitForFunction((s) => !document.querySelector(`${s} button[disabled]`), { timeout: 60_000, polling: 300 }, section);
  await new Promise((r) => setTimeout(r, 500));
};

async function latestCode(to: string, after: number) {
  for (let i = 0; i < 15; i++) {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json?To=${encodeURIComponent(`whatsapp:${to}`)}&PageSize=5`, { headers: { Authorization: auth } });
    const d = (await res.json()) as { messages?: { body: string; date_created: string }[] };
    const m = (d.messages ?? []).find((x) => /verification code/.test(x.body) && Date.parse(x.date_created) >= after - 60_000);
    const code = m?.body.match(/(\d{3}) (\d{3})/);
    if (code) return code[1] + code[2];
    await new Promise((r) => setTimeout(r, 1000));
  }
  return null;
}

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900 });
try {
  await signInPage(page, "coupons.test@example.com", logFile, base);
  await page.goto(`${base}/profile`, { waitUntil: "networkidle0" });
  if (/verified/.test(await text(page))) await press(page, "remove");
  ok(/Join LifeCart on WhatsApp/.test(await text(page)) && Boolean(await page.$(`${section} a[href^='https://wa.me/']`)), "join step shows an Open WhatsApp link with the join message");
  await page.screenshot({ path: `${out}/wa-setup.png`, fullPage: true });

  // 1) Never joined
  await page.type("#wa-phone", "+1 202 555 0143");
  await press(page, "send");
  const alert1 = await page.$eval(`${section} [role=alert]`, (e) => e.textContent ?? "").catch(() => "(no alert)");
  ok(/hasn't joined|couldn't deliver|didn't accept/.test(alert1), `unjoined number refused: "${alert1}"`);
  if (process.env.ONLY_UNJOINED) throw new Error("stopping after the unjoined check (ONLY_UNJOINED)");

  // 2) Joined number: real code
  await page.$eval("#wa-phone", (e) => ((e as HTMLInputElement).value = ""));
  await page.type("#wa-phone", mine);
  const sentAt = Date.now();
  await press(page, "send");
  ok(Boolean(await page.$("#wa-code")), "code step appears for a joined number");
  await page.type("#wa-code", "000000");
  await press(page, "verify");
  ok(/isn't right/.test(await text(page)), "wrong code rejected");
  const code = await latestCode(mine, sentAt);
  ok(Boolean(code), "code arrived on WhatsApp (read back from Twilio's log)");
  await page.$eval("#wa-code", (e) => ((e as HTMLInputElement).value = ""));
  await page.type("#wa-code", code ?? "");
  await press(page, "verify");
  const t2 = await text(page);
  ok(/Alerts go to ···\d{4} · verified/.test(t2), "number verified");
  await page.screenshot({ path: `${out}/wa-verified.png`, fullPage: true });

  // Clean up so this test account never alerts the real phone
  await press(page, "remove");
  ok(/Number removed/.test(await text(page)), "number removed again (test account won't send alerts)");
} catch (e) {
  console.log("ERROR", (e as Error).message);
  await page.screenshot({ path: `${out}/wa-error.png`, fullPage: true }).catch(() => null);
} finally {
  await browser.close();
}
