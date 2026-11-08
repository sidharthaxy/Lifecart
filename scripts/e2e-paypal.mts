// End-to-end PayPal sandbox test: checkout -> PayPal login -> Pay Now -> (subscription approval) -> receipt -> /orders.
// Uses PAYPAL_SANDBOX_BUYER_EMAIL / PAYPAL_SANDBOX_BUYER_PASSWORD from .env.local. Creates REAL sandbox payments and
// sends one WhatsApp receipt. Usage:
//   npx tsx --env-file=.env.local scripts/e2e-paypal.mts <planId> <outDir> [--headful] [--cancel-refills]
import puppeteer, { type Page } from "puppeteer-core";

const args = process.argv.slice(2);
const [planId, out = "."] = args;
const headful = args.includes("--headful");
const cancelRefills = args.includes("--cancel-refills");
const email = process.env.PAYPAL_SANDBOX_BUYER_EMAIL?.trim();
const password = process.env.PAYPAL_SANDBOX_BUYER_PASSWORD?.trim();
if (!planId || !email || !password) throw new Error("usage: <planId> <outDir>; and set PAYPAL_SANDBOX_BUYER_EMAIL/PASSWORD in .env.local");

const base = "http://localhost:3000";
const t0 = Date.now();
const log = (m: string) => console.log(`${((Date.now() - t0) / 1000).toFixed(1).padStart(5)}s  ${m}`);
let shot = 0;
const snap = async (p: Page, name: string) => p.screenshot({ path: `${out}/e2e-${String(++shot).padStart(2, "0")}-${name}.png` });

const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: !headful,
  args: ["--window-size=1280,900"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900 });
page.on("pageerror", (e) => log("pageerror: " + (e as Error).message));

/** Click the first visible button/link whose text matches. */
async function clickText(p: Page, re: RegExp, timeout = 30_000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const handle = await p
      .evaluateHandle((src: string) => {
      const rx = new RegExp(src, "i");
      const els = [...document.querySelectorAll<HTMLElement>("button, a, input[type=submit]")];
      return els.find((el) => {
        const txt = (el.innerText || (el as HTMLInputElement).value || "").trim();
        const r = el.getBoundingClientRect();
        return rx.test(txt) && r.width > 0 && r.height > 0 && !(el as HTMLButtonElement).disabled;
      }) ?? null;
      }, re.source)
      .catch(() => null); // page navigated mid-check
    const el = handle?.asElement();
    if (el) {
      const ok = await (el as unknown as { click: () => Promise<void> }).click().then(() => true, () => false);
      if (ok) return true;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}
const onPayPal = (p: Page) => /paypal\.com/.test(new URL(p.url()).host);
const waitFor = async (cond: () => boolean | Promise<boolean>, timeout: number, what: string) => {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await cond()) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`timed out waiting for ${what} (at ${page.url().slice(0, 90)})`);
};

/** PayPal sandbox login (email -> Next -> password -> Log In); tolerant of the one-page variant. */
async function paypalLogin(p: Page) {
  await p.waitForSelector("#email, input[name=login_email]", { timeout: 45_000 });
  await p.type("#email, input[name=login_email]", email!, { delay: 25 });
  if (await p.$("#btnNext")) {
    await p.click("#btnNext");
  }
  await p.waitForSelector("#password, input[name=login_password]", { visible: true, timeout: 30_000 });
  await p.type("#password, input[name=login_password]", password!, { delay: 25 });
  await snap(p, "paypal-login");
  await Promise.all([p.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 60_000 }).catch(() => null), p.click("#btnLogin")]);
  log("logged in to PayPal sandbox");
}

try {
  // 1. Checkout -> Pay with PayPal
  await page.goto(`${base}/plans/${planId}/checkout`, { waitUntil: "networkidle0" });
  await snap(page, "checkout");
  log("checkout page loaded");
  if (!(await clickText(page, /^Pay with PayPal$/))) throw new Error("Pay with PayPal button not found (plan may be fully paid)");
  await waitFor(() => onPayPal(page), 45_000, "PayPal checkout");
  log("on PayPal: " + new URL(page.url()).pathname);

  // 2-3. Whatever PayPal shows next (login, order review, subscription consent), handle it until we're back on
  // LifeCart. LifeCart may send us to PayPal twice (order, then subscription). Bounded: 6 minutes total.
  const ORDER_BTN = "[data-testid=submit-button-initial], #payment-submit-btn";
  const SUB_RX = /Agree & Subscribe|Agree and Subscribe|^Subscribe$|Agree & Continue|^Continue$|^Pay Now$|^Complete Purchase$/;
  const end = Date.now() + 360_000;
  let clicks = 0;
  let lastDiag = 0;
  while (Date.now() < end) {
    if (Date.now() - lastDiag > 20_000) {
      lastDiag = Date.now();
      const diag = await page
        .evaluate(() => ({
          title: document.title,
          buttons: [...document.querySelectorAll<HTMLElement>("button, a[role=button], input[type=submit]")]
            .filter((b) => b.getBoundingClientRect().width > 0)
            .map((b) => (b.innerText || (b as HTMLInputElement).value || b.id || "").trim().slice(0, 40))
            .filter(Boolean)
            .slice(0, 12),
          text: document.body?.innerText.replace(/\s+/g, " ").slice(0, 200),
        }))
        .catch(() => null);
      log(`diag ${new URL(page.url()).host}${new URL(page.url()).pathname} | ${JSON.stringify(diag)}`);
      await snap(page, "diag").catch(() => null);
    }
    if (!onPayPal(page)) {
      // On LifeCart: either the receipt, or a hop that is about to bounce us back to PayPal.
      await page.waitForNetworkIdle({ idleTime: 1200, timeout: 20_000 }).catch(() => null);
      if (!onPayPal(page)) break;
      continue;
    }
    try {
      await page.waitForNetworkIdle({ idleTime: 800, timeout: 15_000 }).catch(() => null);
      if (await page.$("#email:not([type=hidden]), input[name=login_email]")) {
        await paypalLogin(page);
        continue;
      }
      const orderBtn = await page.$(ORDER_BTN);
      if (orderBtn) {
        const text = await orderBtn.evaluate((b) => (b as HTMLElement).innerText.trim()).catch(() => "?");
        await snap(page, "paypal-order");
        log(`PayPal order button says: "${text}"; clicking`);
        await orderBtn.click();
        clicks++;
        await new Promise((r) => setTimeout(r, 3000));
        continue;
      }
      if (await clickText(page, SUB_RX, 3_000)) {
        await snap(page, "paypal-subscription");
        log("approved the refills subscription");
        clicks++;
        await new Promise((r) => setTimeout(r, 3000));
        continue;
      }
    } catch {
      // page navigated mid-check; try again
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  if (onPayPal(page)) throw new Error(`still on PayPal after ${clicks} approval click(s)`);
  log(`back on LifeCart after ${clicks} PayPal approval(s)`);

  // 4. Receipt
  await page.waitForNetworkIdle({ idleTime: 800, timeout: 60_000 }).catch(() => null);
  await snap(page, "receipt");
  const receipt = (await page.$eval("main", (m) => (m as HTMLElement).innerText)).replace(/\s+/g, " ");
  log("receipt: " + receipt.slice(0, 400));
  if (!/All set/.test(receipt)) throw new Error("did not reach the 'All set' receipt");

  // 5. Orders & watch: live statuses (+ optional cancel)
  await page.goto(`${base}/orders`, { waitUntil: "networkidle0" });
  await snap(page, "orders");
  const managed = await page.$eval("section[aria-labelledby=managed]", (s) => (s as HTMLElement).innerText.replace(/\s+/g, " ")).catch(() => "(no refills/invoices section)");
  log("refills & invoices: " + managed.slice(0, 500));
  if (cancelRefills) {
    if (await clickText(page, /^Cancel refills$/, 10_000)) {
      await clickText(page, /Yes, cancel refills/, 10_000);
      await page.waitForNetworkIdle({ idleTime: 1500, timeout: 60_000 }).catch(() => null);
      await new Promise((r) => setTimeout(r, 2000));
      await page.reload({ waitUntil: "networkidle0" });
      const after = await page.$eval("section[aria-labelledby=managed]", (s) => (s as HTMLElement).innerText.replace(/\s+/g, " ")).catch(() => "");
      log("after cancel: " + after.slice(0, 300));
      await snap(page, "orders-after-cancel");
    } else log("no active refills to cancel");
  }
  log("E2E PASSED");
} catch (e) {
  log("E2E FAILED: " + (e as Error).message);
  await snap(page, "failure").catch(() => null);
} finally {
  await browser.close();
}
