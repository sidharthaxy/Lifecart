// Dev tool: reuses one throwaway account; makes a small plan the first time, then presses "Find coupons" and prints
// the result. Usage: npx tsx scripts/coupon-test.mts <devServerLogFile> <outDir> ["what to plan"]
import puppeteer from "puppeteer-core";
import { CHROME, signInPage } from "./lib/test-session.mjs";

const [logFile, out = ".", prompt = "I need a dog bed and a bag of dry dog food for my 2 year old labrador."] = process.argv.slice(2);
const base = "http://localhost:3000";
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 1366, height: 900 });
try {
  await signInPage(page, "coupons.test@example.com", logFile, base);
  await page.goto(`${base}/plans`, { waitUntil: "networkidle0" });
  const existing = await page.$("main li a[href^='/plans/']");
  if (existing) {
    const href = await existing.evaluate((a) => (a as HTMLAnchorElement).href);
    await page.goto(href, { waitUntil: "networkidle0" });
  } else {
    await page.goto(base, { waitUntil: "networkidle0" });
    await page.type("#goal", prompt);
    await page.click("form[aria-label='Start a plan'] button[type=submit]");
    await page.waitForFunction(() => /\/plans\/[0-9a-f-]{36}$/.test(location.pathname), { timeout: 60_000 });
  }
  const end = Date.now() + 240_000;
  while (Date.now() < end && !(await page.$("[aria-labelledby=coupons]"))) {
    for (const b of await page.$$("button")) {
      if (/^Skip, just plan it$/.test(await b.evaluate((e) => (e as HTMLElement).innerText.trim()))) await b.click();
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  console.log("plan:", new URL(page.url()).pathname);
  for (const b of await page.$$("[aria-labelledby=coupons] button")) {
    if (/Find coupons|Search again/.test(await b.evaluate((e) => (e as HTMLElement).innerText))) {
      await b.click();
      break;
    }
  }
  const t = Date.now();
  await new Promise((r) => setTimeout(r, 1500));
  await page.waitForFunction(() => !/Searching the web/.test(document.querySelector("[aria-labelledby=coupons]")?.textContent ?? ""), { timeout: 150_000, polling: 1000 });
  console.log(`search took ${((Date.now() - t) / 1000).toFixed(0)}s`);
  console.log((await page.$eval("[aria-labelledby=coupons]", (e) => (e as HTMLElement).innerText)).replace(/\n+/g, "\n"));
  const panel = await page.$("[aria-labelledby=coupons]");
  await panel?.screenshot({ path: `${out}/coupons-panel.png` });
} finally {
  await browser.close();
}
