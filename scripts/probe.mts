// Dev tool. Usage: npx tsx scripts/probe.mts <url> [width] [screenshot.png]
// Reports horizontal-overflow culprits, AG Grid row count and console errors, using the local Chrome.
import puppeteer from "puppeteer-core";
const [url, width = "390"] = process.argv.slice(2);
const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
const page = await browser.newPage();
const errors: string[] = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => m.type() === "error" && errors.push("console: " + m.text().slice(0, 200)));
await page.setViewport({ width: Number(width), height: 900 });
await page.goto(url, { waitUntil: "networkidle0" });
await new Promise((r) => setTimeout(r, 1500));
const report = await page.evaluate(() => {
  const vw = document.documentElement.clientWidth;
  const wide = [...document.querySelectorAll("body *")]
    .map((el) => ({ el, r: el.getBoundingClientRect() }))
    .filter(({ r }) => r.right > vw + 1 && r.width > 0)
    .filter(({ el }) => !el.closest(".overflow-x-auto"))
    .slice(0, 8)
    .map(({ el, r }) => `${el.tagName.toLowerCase()}.${String((el as HTMLElement).className).slice(0, 70)} right=${Math.round(r.right)} w=${Math.round(r.width)}`);
  return {
    vw,
    scrollW: document.documentElement.scrollWidth,
    gridRows: document.querySelectorAll(".ag-row").length,
    gridW: Math.round(document.querySelector(".ag-root-wrapper")?.getBoundingClientRect().width ?? -1),
    wide,
  };
});
console.log(JSON.stringify(report, null, 1));
if (process.argv[4]) await page.screenshot({ path: process.argv[4], fullPage: true });
console.log(errors.slice(0, 6).join("\n") || "no console errors");
await browser.close();
