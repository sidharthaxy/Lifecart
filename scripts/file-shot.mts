// Dev tool: screenshot a local HTML file (e.g. a logo preview). Usage: npx tsx scripts/file-shot.mts <file.html> <out.png> [width]
import { pathToFileURL } from "node:url";
import puppeteer from "puppeteer-core";
import { CHROME } from "./lib/test-session.mjs";

const [file, out, width = "900"] = process.argv.slice(2);
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage();
await page.setViewport({ width: Number(width), height: Number(process.argv[5] ?? 600), deviceScaleFactor: Number(process.argv[6] ?? 2) });
await page.goto(pathToFileURL(file).href, { waitUntil: "load" });
await page.screenshot({ path: out, fullPage: true });
await browser.close();
