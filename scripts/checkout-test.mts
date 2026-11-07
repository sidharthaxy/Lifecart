// Dev tool: drives checkout -> WhatsApp approval -> approval page -> "Continue with PayPal" in the local Chrome.
// Stops at PayPal's sandbox login (a human logs in as the sandbox buyer). Sends ONE real WhatsApp message.
// Usage: npx tsx scripts/checkout-test.mts <planId> <outDir>
import puppeteer from "puppeteer-core";
const [planId, out = "."] = process.argv.slice(2);
const base = "http://localhost:3000";
const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
const page = await browser.newPage();
page.on("pageerror", (e) => console.log("pageerror:", (e as Error).message));
page.on("console", (m) => m.type() === "error" && console.log("console.error:", m.text().slice(0, 200)));

await page.setViewport({ width: 1440, height: 1000 });
await page.goto(`${base}/plans/${planId}/checkout`, { waitUntil: "networkidle0" });
const [btn] = await page.$$("xpath/.//button[contains(., 'Approve on WhatsApp')]");
if (!btn) throw new Error("send button not found");
await btn.click();
await page.waitForSelector("xpath/.//a[contains(., 'Open the approval page here')]", { timeout: 30_000 });
const status = await page.$eval("[aria-live=polite] p", (p) => p.textContent);
const link = await page.$eval("xpath/.//a[contains(., 'Open the approval page here')]", (a) => (a as HTMLAnchorElement).href);
console.log("send status:", status);
console.log("approval link:", link.replace(/approve\/(.{6}).*/, "approve/$1…"));
await page.screenshot({ path: `${out}/checkout-sent.png`, fullPage: true });

const phone = await browser.newPage();
await phone.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
await phone.goto(link, { waitUntil: "networkidle0" });
await phone.screenshot({ path: `${out}/approve-mobile.png`, fullPage: true });
const [cta] = await phone.$$("xpath/.//button[contains(., 'PayPal')]");
if (!cta) throw new Error("PayPal button not found");
await Promise.all([phone.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 45_000 }), cta.click()]);
const landed = new URL(phone.url());
console.log("after Continue with PayPal ->", landed.host + landed.pathname, landed.searchParams.has("token") ? "(order token present)" : "");
await new Promise((r) => setTimeout(r, 2500));
await phone.screenshot({ path: `${out}/paypal-landing.png` });
await browser.close();
