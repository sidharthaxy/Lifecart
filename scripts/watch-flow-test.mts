// Dev tool: Orders & watch page -> live price check -> demo price drop (sends one WhatsApp) -> buy link -> PayPal.
// Usage: npx tsx scripts/watch-flow-test.mts [outDir]
import puppeteer from "puppeteer-core";
const out = process.argv[2] ?? ".";
const base = "http://localhost:3000";
const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
const page = await browser.newPage();
page.on("pageerror", (e) => console.log("pageerror:", (e as Error).message));
await page.setViewport({ width: 1280, height: 1000 });
await page.goto(`${base}/orders`, { waitUntil: "networkidle0" });
const watched = await page.$$eval("section[aria-labelledby=watch] li", (lis) => lis.map((li) => li.querySelector("span.font-semibold")?.textContent));
console.log("watched items:", watched);

const [check] = await page.$$("xpath/.//button[contains(., 'Check prices now')]");
if (check) {
  await check.click();
  await page.waitForFunction(() => document.querySelector("[role=status]")?.textContent, { timeout: 90_000 });
  console.log("check now ->", await page.$eval("[role=status]", (e) => e.textContent));
}

await page.goto(`${base}/orders`, { waitUntil: "networkidle0" });
const [sim] = await page.$$("xpath/.//button[contains(., 'simulate a price drop')]");
if (!sim) throw new Error("no simulate button (maybe an alert is already open for every item)");
await sim.click();
await page.waitForSelector("xpath/.//a[contains(., 'Open the buy link')]", { timeout: 60_000 });
console.log("simulate ->", await page.$eval("[role=status]", (e) => e.textContent?.replace("Open the buy link", "").trim()));
const link = await page.$eval("xpath/.//a[contains(., 'Open the buy link')]", (a) => (a as HTMLAnchorElement).href);
await page.goto(`${base}/orders`, { waitUntil: "networkidle0" });
await page.screenshot({ path: `${out}/orders-watch.png`, fullPage: true });

const phone = await browser.newPage();
await phone.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
await phone.goto(link, { waitUntil: "networkidle0" });
await phone.screenshot({ path: `${out}/approve-drop.png`, fullPage: true });
console.log("approve page:", (await phone.$eval("main", (m) => m.textContent ?? "")).replace(/\s+/g, " ").slice(0, 180));
const [cta] = await phone.$$("xpath/.//button[contains(., 'PayPal')]");
await Promise.all([phone.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 45_000 }), cta.click()]);
console.log("Continue with PayPal ->", new URL(phone.url()).host + new URL(phone.url()).pathname);
await browser.close();
