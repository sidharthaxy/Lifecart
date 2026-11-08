// Dev tool: browser test for coupons + every delete flow, as a throwaway signed-in account. Builds ONE real plan
// (Groq + Channel3) and runs ONE coupon search (Kernel + Groq).
// Usage: npx tsx scripts/features-test.mts <devServerLogFile> <outDir>
import puppeteer, { type Page } from "puppeteer-core";
import { CHROME, signInPage } from "./lib/test-session.mjs";

const [logFile, out = "."] = process.argv.slice(2);
const base = "http://localhost:3000";
const ok = (cond: boolean, what: string) => console.log(`${cond ? "PASS" : "FAIL"}  ${what}`);
const t0 = Date.now();
const log = (m: string) => console.log(`${((Date.now() - t0) / 1000).toFixed(0).padStart(4)}s  ${m}`);
const text = (p: Page, sel = "main") => p.$eval(sel, (m) => (m as HTMLElement).innerText).catch(() => "");
const clickText = async (p: Page, re: RegExp, scope = "body") => {
  const handles = await p.$$(`${scope} button, ${scope} a`);
  for (const h of handles) {
    const t = await h.evaluate((e) => (e as HTMLElement).innerText.trim());
    const visible = await h.isVisible().catch(() => false);
    if (visible && re.test(t)) {
      await h.click();
      return true;
    }
  }
  return false;
};
const dialog = "[data-slot=dialog-content]";

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 1366, height: 900 });
const errs: string[] = [];
page.on("pageerror", (e) => errs.push((e as Error).message));
try {
  const email = `features.${Date.now().toString(36)}@example.com`;
  await signInPage(page, email, logFile, base);
  log(`signed in as ${email}`);

  // 1. Build a small real plan
  await page.type("#goal", "I need a dog bed and a bag of dry dog food for my 2 year old labrador.");
  await page.$eval("#budget", (e) => ((e as HTMLInputElement).value = ""));
  await page.type("#budget", "250");
  await page.click("form[aria-label='Start a plan'] button[type=submit]");
  await page.waitForFunction(() => /\/plans\/[0-9a-f-]{36}$/.test(location.pathname), { timeout: 60_000 });
  const planUrl = page.url();
  log("plan created: " + new URL(planUrl).pathname);
  const deadline = Date.now() + 240_000;
  while (Date.now() < deadline && !(await page.$("[aria-labelledby=coupons]"))) {
    if (await clickText(page, /^Skip, just plan it$/)) log("skipped the follow-up questions");
    await new Promise((r) => setTimeout(r, 3000));
    if (!(await page.$("[aria-labelledby=coupons]")) && /Shopping list/.test(await text(page))) await page.reload({ waitUntil: "networkidle0" });
  }
  ok(Boolean(await page.$("[aria-labelledby=coupons]")), "plan is ready and shows the Coupons panel");
  ok(/Find coupons/.test(await text(page, "[aria-labelledby=coupons]")), "coupon search does NOT run on its own (button waiting)");

  // 2. Coupons: only on click
  await clickText(page, /^Find coupons$/, "[aria-labelledby=coupons]");
  log("pressed Find coupons");
  await page.waitForFunction(() => !/Searching the web/.test(document.querySelector("[aria-labelledby=coupons]")?.textContent ?? ""), { timeout: 150_000, polling: 1000 });
  const coupons = await text(page, "[aria-labelledby=coupons]");
  log("coupons panel: " + coupons.replace(/\s+/g, " ").slice(0, 700));
  ok(/Found on the web|No current offers|didn't return/.test(coupons), "coupon search finished with results or a clear message");
  await page.screenshot({ path: `${out}/feat-coupons.png`, fullPage: true });

  // 3. Delete an item: dialog -> Cancel keeps it -> OK removes it
  const before = (await page.$$("button[aria-label^='Remove ']")).length;
  ok(before > 0, `every unpaid row has a delete icon (${before})`);
  const firstName = await page.$eval("button[aria-label^='Remove ']", (b) => b.getAttribute("aria-label")!.replace(/^Remove | from this plan$/g, ""));
  await page.click("button[aria-label^='Remove ']");
  await page.waitForSelector(dialog);
  const dlg = await text(page, dialog);
  ok(/price watch/i.test(dlg), "delete pop-up suggests price watch");
  await page.screenshot({ path: `${out}/feat-delete-item-dialog.png` });
  await clickText(page, /^Cancel$/, dialog);
  await page.waitForFunction((s) => !document.querySelector(s), {}, dialog);
  ok((await page.$$("button[aria-label^='Remove ']")).length === before, "Cancel keeps the item");
  await page.click("button[aria-label^='Remove ']");
  await page.waitForSelector(dialog);
  await clickText(page, /^OK, remove$/, dialog);
  await page.waitForFunction((s) => !document.querySelector(s), { timeout: 20_000 }, dialog);
  await page.waitForFunction((n) => document.querySelectorAll("button[aria-label^='Remove ']").length === n, { timeout: 10_000 }, before - 1).catch(() => null);
  ok((await page.$$("button[aria-label^='Remove ']")).length === before - 1, `OK removes the item (${firstName})`);
  await page.reload({ waitUntil: "networkidle0" });
  ok(!(await text(page)).includes(firstName), "removed item stays gone after reload");

  // 4. "Move to price watch" from the same pop-up (if a product remains)
  if ((await page.$$("button[aria-label^='Remove ']")).length) {
    await page.click("button[aria-label^='Remove ']");
    await page.waitForSelector(dialog);
    if (await clickText(page, /^Move to price watch$/, dialog)) {
      await page.waitForFunction((s) => !document.querySelector(s), { timeout: 20_000 }, dialog);
      ok(Boolean(await page.$("button[aria-label^='Buy ']")), "Move to price watch works from the pop-up");
    } else await clickText(page, /^Cancel$/, dialog);
  }

  // 5. Price watch: remove from the Orders page
  await page.goto(`${base}/orders`, { waitUntil: "networkidle0" });
  const watchBefore = (await page.$$("button[aria-label^='Stop watching']")).length;
  const watchBtn = await page.$("button[aria-label^='Stop watching']");
  if (watchBtn) {
    await watchBtn.click();
    await page.waitForSelector(dialog);
    await clickText(page, /^OK, remove it$/, dialog);
    await page.waitForFunction((s) => !document.querySelector(s), { timeout: 20_000 }, dialog);
    await page.reload({ waitUntil: "networkidle0" });
    ok((await page.$$("button[aria-label^='Stop watching']")).length === watchBefore - 1, `Stop watching removes one item from price watch (${watchBefore} -> ${watchBefore - 1})`);
  }

  // 6. Bills: add one, delete it
  await page.goto(`${base}/bills`, { waitUntil: "networkidle0" });
  await clickText(page, /Add a bill/);
  await page.waitForSelector("form[aria-label='Add a bill'] input[name=name]");
  await page.type("input[name=name]", "Gym membership");
  await page.type("input[name=payee]", "City Gym");
  await page.type("input[name=amount]", "39.99");
  await page.$eval("input[name=dueDate]", (e) => {
    const d = new Date(Date.now() + 10 * 86_400_000);
    (e as HTMLInputElement).value = d.toISOString().slice(0, 10);
  });
  await clickText(page, /^(Add bill|Save bill|Add)$/, "form[aria-label='Add a bill']");
  await page.waitForFunction(() => /Gym membership/.test(document.querySelector("main")?.textContent ?? ""), { timeout: 20_000 });
  await page.click("button[aria-label='Delete Gym membership']");
  await page.waitForSelector(dialog);
  await page.screenshot({ path: `${out}/feat-delete-bill-dialog.png` });
  await clickText(page, /^OK, delete bill$/, dialog);
  await page.waitForFunction((s) => !document.querySelector(s), { timeout: 20_000 }, dialog);
  await page.reload({ waitUntil: "networkidle0" });
  ok(!/Gym membership/.test(await text(page)), "bill deleted");

  // 7. Delete the plan from the Plans list
  await page.goto(`${base}/plans`, { waitUntil: "networkidle0" });
  await page.click("button[aria-label^='Delete plan']");
  await page.waitForSelector(dialog);
  await clickText(page, /^OK, delete plan$/, dialog);
  await page.waitForFunction((s) => !document.querySelector(s), { timeout: 20_000 }, dialog);
  await page.reload({ waitUntil: "networkidle0" });
  ok(/No plans yet/.test(await text(page)), "plan deleted from the Plans list");
  const gone = await page.goto(planUrl, { waitUntil: "networkidle0" });
  ok(/couldn.t find that page/i.test(await text(page, "body")) || gone?.status() === 404, "deleted plan's page shows not found");

  // 8. Delete the account
  await page.goto(`${base}/profile`, { waitUntil: "networkidle0" });
  await page.click("button[aria-label='Delete my account']");
  await page.waitForSelector(dialog);
  await clickText(page, /^OK, delete everything$/, dialog);
  await page.waitForSelector("#email", { timeout: 30_000 });
  ok(true, "account deleted and signed out");
  await page.goto(`${base}/plans`, { waitUntil: "networkidle0" });
  ok(new URL(page.url()).pathname === "/", "after deleting the account, app pages need sign-in again");
} catch (e) {
  console.log("ERROR", (e as Error).message);
  await page.screenshot({ path: `${out}/feat-error.png`, fullPage: true }).catch(() => null);
} finally {
  console.log("page errors:", errs);
  await browser.close();
}
