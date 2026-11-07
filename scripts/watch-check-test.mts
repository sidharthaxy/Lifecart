// Dev tool: clicks "Check prices now" on /orders and prints the result (no simulate, so only real drops alert).
// Usage: npx tsx scripts/watch-check-test.mts [outDir]
import puppeteer from "puppeteer-core";
const out = process.argv[2] ?? ".";
const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
const page = await browser.newPage();
page.on("pageerror", (e) => console.log("pageerror:", (e as Error).message));
await page.setViewport({ width: 1280, height: 1000 });
await page.goto("http://localhost:3000/orders", { waitUntil: "networkidle0" });
console.log("watched items:", (await page.$$("section[aria-labelledby=watch] li")).length);
const [check] = await page.$$("xpath/.//button[contains(., 'Check prices now')]");
const t = Date.now();
await check.click();
await page.waitForFunction(() => document.querySelector("[role=status]")?.textContent, { timeout: 120_000 });
console.log(`result (${((Date.now() - t) / 1000).toFixed(1)}s):`, await page.$eval("[role=status]", (e) => e.textContent));
await page.screenshot({ path: `${out}/orders-after-check.png`, fullPage: true });
await browser.close();
