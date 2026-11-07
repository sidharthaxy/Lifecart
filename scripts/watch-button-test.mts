// Dev tool: checks the grid Watch/Buy now button and the direct "Pay with PayPal" checkout.
// Usage: npx tsx scripts/watch-button-test.mts <planId> [outDir] [--restore "Item name" ...]
import puppeteer from "puppeteer-core";
const args = process.argv.slice(2);
const [planId, out = "."] = args;
const restore = args.includes("--restore") ? args.slice(args.indexOf("--restore") + 1) : [];
const base = "http://localhost:3000";
const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
const page = await browser.newPage();
page.on("pageerror", (e) => console.log("pageerror:", (e as Error).message));
await page.setViewport({ width: 1440, height: 1100 });
await page.goto(`${base}/plans/${planId}`, { waitUntil: "networkidle0" });
const firstMonth = () => page.$eval("aside[aria-label='Budget summary'] .tabular", (el) => el.textContent);

// Undo items moved by earlier runs
for (const name of restore) {
  const btn = await page.$(`button[aria-label="Buy ${name} now"]`);
  if (!btn) {
    console.log("restore: not watching", name);
    continue;
  }
  const t0 = await firstMonth();
  await btn.click();
  await page.waitForFunction((t) => document.querySelector("aside[aria-label='Budget summary'] .tabular")?.textContent !== t, { timeout: 10_000 }, t0);
  console.log(`restored "${name}" -> first month ${await firstMonth()}`);
}

const before = await firstMonth();
const [watchBtn] = await page.$$("xpath/.//button[normalize-space()='Watch']");
if (!watchBtn) throw new Error("no Watch button found");
const label = (await watchBtn.evaluate((b) => b.getAttribute("aria-label")))!;
const name = label.replace(/^Watch /, "").replace(/ for a lower price$/, "");
await watchBtn.click();
await page.waitForSelector(`button[aria-label="Buy ${name} now"]`, { timeout: 10_000 });
const after = await firstMonth();
console.log(`Watch "${name}": first month ${before} -> ${after}; drawer opened: ${Boolean(await page.$("[role=dialog]"))}`);
await page.screenshot({ path: `${out}/grid-watch.png` });

await (await page.$(`button[aria-label="Buy ${name} now"]`))!.click();
await page.waitForFunction((b) => document.querySelector("aside[aria-label='Budget summary'] .tabular")?.textContent === b, { timeout: 10_000 }, before);
console.log(`Buy now "${name}": first month back to ${await firstMonth()}`);

await page.goto(`${base}/plans/${planId}/checkout`, { waitUntil: "networkidle0" });
const [pay] = await page.$$("xpath/.//button[contains(., 'Pay with PayPal')]");
await Promise.all([page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 45_000 }), pay.click()]);
const u = new URL(page.url());
console.log("Pay with PayPal ->", u.host + u.pathname);
await browser.close();
