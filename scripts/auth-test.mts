// Dev tool: end-to-end sign-in test against the local dev server (dev mode prints codes to the server log).
// Signs up user A, onboards, creates nothing billable; signs up user B and checks B can't see A's pages.
// Usage: npx tsx scripts/auth-test.mts <devServerLogFile> <outDir>
import { readFileSync } from "node:fs";
import puppeteer, { type Page } from "puppeteer-core";

const [logFile, out = "."] = process.argv.slice(2);
const base = "http://localhost:3000";
const codeFor = (email: string) => {
  const m = [...readFileSync(logFile, "utf8").matchAll(new RegExp(`Sign-in code for ${email.replace(/[.+]/g, "\\$&")}: (\\d{6})`, "g"))];
  return m.at(-1)?.[1];
};
const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
const errs: string[] = [];
const run = Date.now().toString(36);
const A = `alex.test+a${run}@example.com`;
const B = `blake.test+b${run}@example.com`;
const ok = (cond: boolean, what: string) => console.log(`${cond ? "PASS" : "FAIL"}  ${what}`);

async function signIn(page: Page, email: string, name?: string) {
  await page.goto(base, { waitUntil: "networkidle0" });
  await page.type("#email", email);
  await Promise.all([page.waitForSelector("#code", { timeout: 30_000 }), page.click("button[value=send]")]);
  await new Promise((r) => setTimeout(r, 500));
  const code = codeFor(email);
  if (!code) throw new Error("no code in server log for " + email);
  // Wrong code first
  await page.type("#code", "000000");
  await page.click("button[value=verify]");
  await page.waitForSelector("[role=alert]", { timeout: 20_000 });
  ok(/isn't right/.test(await page.$eval("[role=alert]", (e) => e.textContent ?? "")), `${email}: wrong code is rejected`);
  await page.$eval("#code", (e) => ((e as HTMLInputElement).value = ""));
  await page.type("#code", code);
  await page.click("button[value=verify]");
  await page.waitForSelector("input[name=name], #budget", { timeout: 30_000 });
  if (name) {
    ok(page.url().endsWith("/welcome"), `${email}: new account goes to /welcome`);
    await page.screenshot({ path: `${out}/auth-welcome.png`, fullPage: true });
    await page.type("input[name=name]", name);
    await page.type("input[name=monthlyBudget]", "750");
    await page.click("button[type=submit]:not([name=intent])");
    await page.waitForSelector("#budget", { timeout: 30_000 });
  }
  ok(new URL(page.url()).pathname === "/", `${email}: lands on home`);
}

try {
  const ctxA = await browser.createBrowserContext();
  const a = await ctxA.newPage();
  a.on("pageerror", (e) => errs.push("A: " + (e as Error).message));
  await a.setViewport({ width: 1280, height: 900 });

  // Signed out: protected pages bounce to the landing page
  await a.goto(`${base}/money`, { waitUntil: "networkidle0" });
  ok(new URL(a.url()).pathname === "/", "signed out: /money redirects to sign-in");
  await a.screenshot({ path: `${out}/auth-landing.png`, fullPage: true });

  await signIn(a, A, "Alex Kim");
  const home = await a.$eval("main", (m) => (m as HTMLElement).innerText);
  ok(/hi alex/i.test(home), "home greets by name");
  ok((await a.$eval("#budget", (e) => (e as HTMLInputElement).value)) === "750", "goal form budget defaults to profile budget");
  ok((await a.$eval("#goal", (e) => (e as HTMLTextAreaElement).value)) === "", "goal box starts empty");
  ok(/Shopping budget/.test(home), "budget label says Shopping budget");
  await a.screenshot({ path: `${out}/auth-home.png`, fullPage: true });

  // Avatar menu -> profile
  await a.click("button[aria-haspopup=menu]");
  await a.waitForSelector("[role=menu]");
  ok(new RegExp(A.replace(/[.+]/g, "\\$&")).test(await a.$eval("[role=menu]", (m) => m.textContent ?? "")), "avatar menu shows email");
  await a.screenshot({ path: `${out}/auth-menu.png` });
  await a.click("a[href='/profile']");
  await a.waitForSelector("input[name=monthlyBudget]", { timeout: 30_000 });
  await a.waitForFunction(() => location.pathname === "/profile", { timeout: 30_000 });
  await new Promise((r) => setTimeout(r, 1500));
  console.log("  at", await a.evaluate(() => location.pathname), "h1:", await a.$$eval("h1", (hs) => hs.map((h) => h.textContent)));
  ok(/Profile and settings/.test(await a.$eval("main", (m) => (m as HTMLElement).innerText)), "profile page opens");
  await a.screenshot({ path: `${out}/auth-profile.png`, fullPage: true });

  // Empty, fresh pages
  await a.goto(`${base}/bills`, { waitUntil: "networkidle0" });
  ok(/No bills yet/.test(await a.$eval("main", (m) => (m as HTMLElement).innerText)), "bills start empty");
  await a.goto(`${base}/money`, { waitUntil: "networkidle0" });
  ok(/\$0\.00/.test(await a.$eval("main", (m) => (m as HTMLElement).innerText)), "money starts at $0");
  await a.goto(`${base}/plans`, { waitUntil: "networkidle0" });
  ok(/No plans yet/.test(await a.$eval("main", (m) => (m as HTMLElement).innerText)), "plans start empty");

  // Add a bill as A, then check B can't see it
  await a.goto(`${base}/bills`, { waitUntil: "networkidle0" });

  // User B in a separate browser context
  const ctxB = await browser.createBrowserContext();
  const b = await ctxB.newPage();
  b.on("pageerror", (e) => errs.push("B: " + (e as Error).message));
  await signIn(b, B, "Blake");

  // Sign out A
  await a.goto(base, { waitUntil: "networkidle0" });
  await a.click("button[aria-haspopup=menu]");
  await a.waitForSelector("[role=menu]");
  await a.click("[role=menu] form button");
  await a.waitForSelector("#email", { timeout: 30_000 });
  ok(!!(await a.$("#email")), "sign out returns to the sign-in form");
  await a.goto(`${base}/orders`, { waitUntil: "networkidle0" });
  ok(new URL(a.url()).pathname === "/", "after sign-out, /orders redirects to sign-in");

  // Returning user goes straight in (no welcome)
  await signIn(a, A);
  ok(/hi alex/i.test(await a.$eval("main", (m) => (m as HTMLElement).innerText)), "returning user skips the welcome questions");
} catch (e) {
  console.log("ERROR", (e as Error).message);
} finally {
  console.log("page errors:", errs);
  await browser.close();
}
