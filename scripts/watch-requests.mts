// Dev tool. Usage: npx tsx scripts/watch-requests.mts <url> [seconds]
// Logs same-origin document/fetch requests with the JS stack that initiated them, to find refresh/fetch loops.
import puppeteer from "puppeteer-core";
const [url, secs = "8"] = process.argv.slice(2);
const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
const page = await browser.newPage();
const cdp = await page.createCDPSession();
await cdp.send("Network.enable");
const t0 = Date.now();
const origin = new URL(url).origin;
let shown = 0;
cdp.on("Network.requestWillBeSent", (e) => {
  const u = e.request.url;
  if (!u.startsWith(origin) || /\/_next\/static|\.woff2|favicon|webpack-hmr|turbopack/.test(u)) return;
  if (shown++ > 14) return;
  type Frame = { functionName: string; url: string; lineNumber: number };
  const frames: Frame[] = [];
  let st = e.initiator.stack as { callFrames: Frame[]; parent?: unknown } | undefined;
  while (st && frames.length < 8) {
    frames.push(...st.callFrames);
    st = st.parent as typeof st;
  }
  const where = frames
    .slice(0, 8)
    .map((f) => `${f.functionName || "<anon>"}@${f.url.split("/").pop()?.slice(0, 40)}:${f.lineNumber}`)
    .join(" < ");
  console.log(`${((Date.now() - t0) / 1000).toFixed(1)}s ${e.request.method} ${e.type} ${u.replace(origin, "").slice(0, 70)}\n   initiator=${e.initiator.type} ${where}`);
});
page.on("console", (m) => ["error", "warn"].includes(m.type()) && console.log("console." + m.type() + ": " + m.text().slice(0, 300)));
page.on("pageerror", (e) => console.log("pageerror: " + (e as Error).message));
await page.goto(url, { waitUntil: "domcontentloaded" });
await new Promise((r) => setTimeout(r, Number(secs) * 1000));
await browser.close();
