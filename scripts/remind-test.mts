// Dev tool: clicks "Send due-date reminder now" twice: the first should send ONE WhatsApp (if anything is due
// within 3 days), the second must be blocked by the 24h cooldown. Usage: npx tsx scripts/remind-test.mts
import puppeteer from "puppeteer-core";
const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 1000 });
for (const round of [1, 2]) {
  await page.goto("http://localhost:3000/bills", { waitUntil: "networkidle0" });
  const [btn] = await page.$$("xpath/.//button[contains(., 'Send due-date reminder now')]");
  await btn.click();
  await page.waitForSelector("[role=status]", { timeout: 60_000 });
  console.log(`click ${round}:`, await page.$eval("[role=status]", (e) => e.textContent));
}
await browser.close();
