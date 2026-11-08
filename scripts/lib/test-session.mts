// Dev helper: sign in a throwaway @example.com account through the real sign-in UI and return its session cookie.
// @example.com addresses are never emailed; in development their code is printed in the dev server log, which
// this reads. Pass the file that `npm run dev` writes its output to.
import { readFileSync } from "node:fs";
import puppeteer, { type Page } from "puppeteer-core";

export const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

function codeFromLog(logFile: string, email: string) {
  const esc = email.replace(/[.+]/g, "\\$&");
  return [...readFileSync(logFile, "utf8").matchAll(new RegExp(`Sign-in code for ${esc}: (\\d{6})`, "g"))].at(-1)?.[1];
}

/** Sign in on an open page (creating and onboarding the account if it's new). */
export async function signInPage(page: Page, email: string, logFile: string, base = "http://localhost:3000") {
  await page.goto(base, { waitUntil: "networkidle0" });
  await page.type("#email", email);
  await page.click("button[value=send]");
  await page.waitForSelector("#code", { timeout: 30_000 });
  let code: string | undefined;
  for (let i = 0; i < 20 && !code; i++) {
    await new Promise((r) => setTimeout(r, 250));
    code = codeFromLog(logFile, email);
  }
  if (!code) throw new Error(`no sign-in code for ${email} in ${logFile}`);
  await page.type("#code", code);
  await page.click("button[value=verify]");
  await page.waitForSelector("#budget, input[name=name]", { timeout: 30_000 });
  if (await page.$("input[name=name]")) {
    await page.type("input[name=name]", "Test User");
    await page.click("button[type=submit]:not([name=intent])");
    await page.waitForSelector("#budget", { timeout: 30_000 });
  }
}

/** A fresh signed-in account; returns a Cookie header value for fetch(). */
export async function testSession(logFile: string, label: string, base = "http://localhost:3000") {
  const email = `${label}.${Date.now().toString(36)}@example.com`;
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
  try {
    const page = await browser.newPage();
    await signInPage(page, email, logFile, base);
    const cookie = (await page.cookies()).find((c) => c.name === "lc_session");
    if (!cookie) throw new Error("no session cookie after sign-in");
    return { email, cookie: `lc_session=${cookie.value}` };
  } finally {
    await browser.close();
  }
}
