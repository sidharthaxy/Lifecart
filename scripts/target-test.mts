// Dev tool: edit a watched item's target price in the plan table and on Orders & watch (reuses coupons.test account).
// Usage: npx tsx scripts/target-test.mts <devServerLogFile> <outDir> <planPath>
import puppeteer, { type Page } from "puppeteer-core";
import { CHROME, signInPage } from "./lib/test-session.mjs";

const [logFile, out = ".", planPath] = process.argv.slice(2);
const base = "http://localhost:3000";
const ok = (cond: boolean, what: string) => console.log(`${cond ? "PASS" : "FAIL"}  ${what}`);
const dialog = "[data-slot=dialog-content]";
const clickIn = async (p: Page, scope: string, re: RegExp) => {
  for (const b of await p.$$(`${scope} button`)) if (re.test(await b.evaluate((e) => (e as HTMLElement).innerText.trim()))) return b.click();
  throw new Error(`no button ${re} in ${scope}`);
};
const targetText = (p: Page) => p.$eval("button[aria-label^='Change the target price']", (b) => (b as HTMLElement).innerText.trim());

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 1366, height: 900 });
try {
  await signInPage(page, "coupons.test@example.com", logFile, base);
  await page.goto(base + planPath, { waitUntil: "networkidle0" });
  const before = await targetText(page);
  console.log("plan table shows:", before);

  // Too high -> refused
  await page.click("button[aria-label^='Change the target price']");
  await page.waitForSelector(dialog);
  await page.screenshot({ path: `${out}/target-dialog.png` });
  await page.$eval(`${dialog} input`, (e) => ((e as HTMLInputElement).value = ""));
  await page.type(`${dialog} input`, "999");
  await clickIn(page, dialog, /^Save target$/);
  await page.waitForSelector(`${dialog} [role=alert]`, { timeout: 15_000 });
  const err = await page.$eval(`${dialog} [role=alert]`, (e) => e.textContent ?? "");
  ok(/below today/.test(err), `a target above today's price is refused ("${err}")`);

  // Quick pick -> saved, table updates without reload
  await clickIn(page, dialog, /^10% off/);
  const picked = await page.$eval(`${dialog} input`, (e) => (e as HTMLInputElement).value);
  await clickIn(page, dialog, /^Save target$/);
  await page.waitForFunction((s) => !document.querySelector(s), { timeout: 15_000 }, dialog);
  const after = await targetText(page);
  ok(after.includes(picked), `quick pick saved and shown in the table (${before} -> ${after})`);
  await page.reload({ waitUntil: "networkidle0" });
  ok((await targetText(page)).includes(picked), "new target survives a reload");

  // Orders & watch
  await page.goto(`${base}/orders`, { waitUntil: "networkidle0" });
  await page.click("button[aria-label^='Change the target price']");
  await page.waitForSelector(dialog);
  await page.$eval(`${dialog} input`, (e) => ((e as HTMLInputElement).value = ""));
  await page.type(`${dialog} input`, "41.5");
  await clickIn(page, dialog, /^Save target$/);
  await page.waitForFunction((s) => !document.querySelector(s), { timeout: 15_000 }, dialog);
  await page.waitForFunction(() => /41\.50/.test(document.querySelector("button[aria-label^='Change the target price']")?.textContent ?? ""), { timeout: 15_000 }).catch(() => null);
  ok((await targetText(page)).includes("41.50"), "target edited on Orders & watch ($41.50)");
  await page.screenshot({ path: `${out}/target-orders.png` });
} catch (e) {
  console.log("ERROR", (e as Error).message);
  await page.screenshot({ path: `${out}/target-error.png`, fullPage: true }).catch(() => null);
} finally {
  await browser.close();
}
