// Dev tool: screenshot a page (desktop + phone width), print its text and any browser errors.
// Usage: npx tsx scripts/page-shot.mts /money <outDir>
import puppeteer from "puppeteer-core";
const [path = "/", out = "."] = process.argv.slice(2);
const name = path.replace(/\W+/g, "-").replace(/^-|-$/g, "") || "home";
const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 1366, height: 900 });
const errs: string[] = [];
page.on("pageerror", (e) => errs.push((e as Error).message));
page.on("console", (m) => m.type() === "error" && errs.push("console: " + m.text().slice(0, 200)));
const t0 = Date.now();
await page.goto(`http://localhost:3000${path}`, { waitUntil: "networkidle0", timeout: 180_000 });
console.log("loaded in", ((Date.now() - t0) / 1000).toFixed(1), "s");
await new Promise((r) => setTimeout(r, 2000));
console.log((await page.$eval("main", (m) => (m as HTMLElement).innerText)).replace(/\s+/g, " ").slice(0, 1200));
await page.screenshot({ path: `${out}/${name}-desktop.png`, fullPage: true });
await page.setViewport({ width: 390, height: 844 });
await new Promise((r) => setTimeout(r, 1500));
await page.screenshot({ path: `${out}/${name}-phone.png`, fullPage: true });
console.log("scrollWidth at 390:", await page.evaluate(() => document.documentElement.scrollWidth));
console.log("errors:", errs);
await browser.close();
