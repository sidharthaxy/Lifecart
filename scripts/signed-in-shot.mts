// Dev tool: sign in as an existing account (dev mode reads the code from the server log), then screenshot a page
// at desktop and phone width. Usage: npx tsx scripts/signed-in-shot.mts <email> <path> <devServerLogFile> <outDir>
import { readFileSync } from "node:fs";
import puppeteer from "puppeteer-core";

const [email, path, logFile, out = "."] = process.argv.slice(2);
const base = "http://localhost:3000";
const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 1366, height: 900 });
const errs: string[] = [];
page.on("pageerror", (e) => errs.push((e as Error).message));
await page.goto(base, { waitUntil: "networkidle0" });
await page.type("#email", email);
await page.click("button[value=send]");
await page.waitForSelector("#code", { timeout: 30_000 });
await new Promise((r) => setTimeout(r, 500));
const esc = email.replace(/[.+]/g, "\\$&");
const code = [...readFileSync(logFile, "utf8").matchAll(new RegExp(`Sign-in code for ${esc}: (\\d{6})`, "g"))].at(-1)?.[1];
if (!code) throw new Error("no code in log");
await page.type("#code", code);
await page.click("button[value=verify]");
await page.waitForSelector("#budget, input[name=name]", { timeout: 30_000 });
const budgetArg = process.argv.indexOf("--budget");
if (budgetArg > 0) {
  await page.goto(base + "/profile", { waitUntil: "networkidle0" });
  await page.$eval("input[name=monthlyBudget]", (e) => ((e as HTMLInputElement).value = ""));
  await page.type("input[name=monthlyBudget]", process.argv[budgetArg + 1]);
  await page.click("button[type=submit]");
  await page.waitForSelector("[role=status]", { timeout: 30_000 });
}
const res = await page.goto(base + path, { waitUntil: "networkidle0" });
console.log("status", res?.status(), "at", new URL(page.url()).pathname);
const name = path.replace(/\W+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "home";
await page.screenshot({ path: `${out}/${name}-desktop.png`, fullPage: true });
await page.setViewport({ width: 390, height: 844 });
await new Promise((r) => setTimeout(r, 1200));
await page.screenshot({ path: `${out}/${name}-phone.png`, fullPage: true });
console.log("scrollWidth at 390:", await page.evaluate(() => document.documentElement.scrollWidth));
console.log("h1:", await page.$eval("main h1", (h) => h.textContent).catch(() => "(none)"));
console.log("errors:", errs);
await browser.close();
