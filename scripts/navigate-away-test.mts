// Dev tool: can you keep using the app while the agent plans or coupons are being searched?
// Starts a REAL plan (Groq + Channel3), leaves the page right away, browses other pages (timing them), then comes
// back and checks the plan finished. Then presses Find coupons, leaves immediately, and checks results were saved.
// Usage: npx tsx --env-file=.env.local scripts/navigate-away-test.mts <devServerLogFile> <outDir>
import puppeteer, { type Page } from "puppeteer-core";
import { CHROME, signInPage } from "./lib/test-session.mjs";

const [logFile] = process.argv.slice(2);
const base = "http://localhost:3000";
const ok = (cond: boolean, what: string) => console.log(`${cond ? "PASS" : "FAIL"}  ${what}`);
const timed = async (p: Page, path: string) => {
  const t = Date.now();
  await p.goto(base + path, { waitUntil: "networkidle0", timeout: 60_000 });
  return (Date.now() - t) / 1000;
};

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900 });
try {
  await signInPage(page, `navaway.${Date.now().toString(36)}@example.com`, logFile, base);

  // 1) Start a plan, skip questions, and leave as soon as the agent is working
  await page.type("#goal", "I need a sturdy laptop backpack for my daily commute.");
  await page.click("form[aria-label='Start a plan'] button[type=submit]");
  await page.waitForFunction(() => /\/plans\/[0-9a-f-]{36}$/.test(location.pathname), { timeout: 60_000 });
  const planPath = new URL(page.url()).pathname;
  // Wait for the follow-up questions (or none) and skip them, so the agent actually starts planning.
  let skipped = false;
  for (let i = 0; i < 40 && !skipped; i++) {
    for (const b of await page.$$("button")) {
      if (/^Skip, just plan it$/.test(await b.evaluate((e) => (e as HTMLElement).innerText.trim()))) {
        await b.click();
        skipped = true;
        break;
      }
    }
    if (!skipped && (await page.$("[aria-labelledby=coupons]"))) break; // no questions and already done
    await new Promise((r) => setTimeout(r, 1000));
  }
  console.log(skipped ? "skipped the questions; agent is planning" : "no questions asked");
  await new Promise((r) => setTimeout(r, 3000)); // the agent is now mid-run
  const tBills = await timed(page, "/bills");
  const tMoney = await timed(page, "/money");
  const tOrders = await timed(page, "/orders");
  console.log(`while planning: /bills ${tBills}s, /money ${tMoney}s, /orders ${tOrders}s`);
  ok(Math.max(tBills, tMoney, tOrders) < 20, "other pages load normally while the agent is planning");

  // Come back later: the plan should have finished in the background
  let ready = false;
  for (let i = 0; i < 24 && !ready; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    await page.goto(base + planPath, { waitUntil: "networkidle0" });
    ready = Boolean(await page.$("[aria-labelledby=coupons]"));
  }
  ok(ready, "the plan finished in the background after leaving the page");

  // 2) Coupons: press, leave right away, come back
  if (ready) {
    for (const b of await page.$$("[aria-labelledby=coupons] button")) {
      if (/Find coupons|Search again/.test(await b.evaluate((e) => (e as HTMLElement).innerText))) { await b.click(); break; }
    }
    await new Promise((r) => setTimeout(r, 1500));
    const tHome = await timed(page, "/");
    console.log(`while searching coupons: / ${tHome}s`);
    ok(tHome < 20, "home loads normally while coupons are being searched");
    await new Promise((r) => setTimeout(r, 60_000));
    await page.goto(base + planPath, { waitUntil: "networkidle0" });
    const panel = await page.$eval("[aria-labelledby=coupons]", (e) => (e as HTMLElement).innerText).catch(() => "");
    ok(/Checked|No current offers|OFF|off/.test(panel), "coupon results were saved even though we left the page");
  }
} catch (e) {
  console.log("ERROR", (e as Error).message);
} finally {
  await browser.close();
}
