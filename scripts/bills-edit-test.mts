// Dev tool: bills with a billing period (add, live period label, bad dates refused, edit amount + period) and the
// home page mic button (shown when the browser supports speech-to-text, hidden when it doesn't).
// Usage: npx tsx scripts/bills-edit-test.mts <devServerLogFile> <outDir>
import puppeteer, { type Page } from "puppeteer-core";
import { CHROME, signInPage } from "./lib/test-session.mjs";

const [logFile, out = "."] = process.argv.slice(2);
const base = "http://localhost:3000";
const ok = (cond: boolean, what: string) => console.log(`${cond ? "PASS" : "FAIL"}  ${what}`);
const text = (p: Page, sel = "main") => p.$eval(sel, (m) => (m as HTMLElement).innerText).catch(() => "");
/** Set a React-controlled input (date fields) like a user would. */
const setValue = (p: Page, sel: string, v: string) =>
  p.$eval(
    sel,
    (el, val) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(el, val);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    },
    v,
  );
const clickText = async (p: Page, scope: string, re: RegExp) => {
  for (const b of await p.$$(`${scope} button`)) if (re.test(await b.evaluate((e) => (e as HTMLElement).innerText.trim()))) return b.click();
  throw new Error(`no button ${re}`);
};

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 1366, height: 900 });
try {
  await signInPage(page, `bills.${Date.now().toString(36)}@example.com`, logFile, base);

  // Mic: visible in Chrome (which has speech-to-text)
  await page.goto(base, { waitUntil: "networkidle0" });
  ok(Boolean(await page.$("button[aria-label='Speak instead of typing']")), "mic button shows in a browser with speech-to-text");
  await page.screenshot({ path: `${out}/mic-home.png`, clip: { x: 250, y: 280, width: 860, height: 380 } });

  // Add a bill with a 2-week period
  await page.goto(`${base}/bills`, { waitUntil: "networkidle0" });
  await clickText(page, "main", /Add a bill/);
  const form = "form[aria-label='Add a bill']";
  await page.waitForSelector(`${form} input[name=name]`);
  await page.type(`${form} input[name=name]`, "Cleaner");
  await page.type(`${form} input[name=payee]`, "Sparkle Co");
  await page.type(`${form} input[name=amount]`, "60");
  await setValue(page, `${form} input[name=periodStart]`, "2026-11-09");
  await setValue(page, `${form} input[name=dueDate]`, "2026-11-01");
  ok(/end after it starts/.test(await text(page, form)), "end before start is flagged while picking");
  await setValue(page, `${form} input[name=dueDate]`, "2026-11-23");
  ok(/every 2 weeks/i.test(await text(page, form)), "the form shows 'Billed every 2 weeks'");
  await page.screenshot({ path: `${out}/bill-add-form.png`, fullPage: false });
  await clickText(page, form, /^Save bill$/);
  await page.waitForFunction(() => /Cleaner/.test(document.querySelector("main")?.innerText ?? "") && !document.querySelector("form[aria-label='Add a bill']"), { timeout: 20_000 });
  ok(/Every 2 weeks/.test(await text(page)), "the bill row says 'Every 2 weeks'");

  // Edit: raise the amount and switch to a monthly period
  await page.click("button[aria-label='Edit Cleaner']");
  const dlg = "[data-slot=dialog-content]";
  await page.waitForSelector(`${dlg} input[name=amount]`);
  ok((await page.$eval(`${dlg} input[name=amount]`, (e) => (e as HTMLInputElement).value)) === "60.00", "edit form is filled in with the current amount");
  await page.$eval(`${dlg} input[name=amount]`, (e) => ((e as HTMLInputElement).value = ""));
  await page.type(`${dlg} input[name=amount]`, "75.50");
  await setValue(page, `${dlg} input[name=dueDate]`, "2026-12-09");
  ok(/every 1 month/i.test(await text(page, dlg)), "edit form shows 'Billed every 1 month'");
  await page.screenshot({ path: `${out}/bill-edit-dialog.png` });
  await clickText(page, dlg, /^Save changes$/);
  await page.waitForFunction((s) => !document.querySelector(s), { timeout: 20_000 }, dlg);
  await page.reload({ waitUntil: "networkidle0" });
  const after = await text(page);
  ok(/\$75\.50/.test(after) && /Every 1 month/.test(after), "after saving: $75.50, every 1 month");
  ok(/Dec 9/.test(after), "due date moved to 9 December");
  await page.screenshot({ path: `${out}/bills-after-edit.png`, fullPage: true });

  // Mic hidden where the browser has no speech-to-text
  const p2 = await browser.newPage();
  await p2.evaluateOnNewDocument(() => {
    // @ts-expect-error simulate a browser without the Web Speech API
    delete window.webkitSpeechRecognition;
    // @ts-expect-error same
    delete window.SpeechRecognition;
  });
  const cookies = await page.cookies();
  await p2.setCookie(...cookies);
  await p2.goto(base, { waitUntil: "networkidle0" });
  ok(Boolean(await p2.$("#goal")) && !(await p2.$("button[aria-label='Speak instead of typing']")), "mic button hidden when speech-to-text isn't available");
} catch (e) {
  console.log("ERROR", (e as Error).message);
  await page.screenshot({ path: `${out}/bills-error.png`, fullPage: true }).catch(() => null);
} finally {
  await browser.close();
}
