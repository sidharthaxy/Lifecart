// Dev tool: one Kernel browser session -> web search for a store's promo codes, then read the top coupon pages.
// Usage: npx tsx --env-file=.env.local scripts/coupon-probe.mts chewy.com
import Kernel from "@onkernel/sdk";
const domain = process.argv[2] ?? "chewy.com";
const kernel = new Kernel({ apiKey: process.env.KERNEL_API_KEY });
const t0 = Date.now();
const b = await kernel.browsers.create({ stealth: true, headless: true, timeout_seconds: 120 });
try {
  const code = `
    const q = ${JSON.stringify(domain + " promo code")};
    const out = { links: [], pages: [] };
    await page.goto("https://html.duckduckgo.com/html/?q=" + encodeURIComponent(q), { waitUntil: "domcontentloaded", timeout: 15000 });
    const raw = await page.$$eval("a.result__a", (as) => as.map((a) => a.href));
    for (const h of raw) {
      let u = h;
      try { const p = new URL(h); if (p.searchParams.get("uddg")) u = p.searchParams.get("uddg"); } catch {}
      if (/duckduckgo\\.com\\/y\\.js|bing\\.com\\/aclick/.test(u)) continue; // ads
      out.links.push(u);
    }
    for (const u of out.links.filter((l) => /couponfollow|retailcoupons|wethrift|knoji|dealspotr|couponbirds/.test(l)).slice(0, 2)) {
      try {
        await page.goto(u, { waitUntil: "domcontentloaded", timeout: 15000 });
        await page.waitForTimeout(2000);
        let text = "";
        try { text = await page.evaluate(() => document.body.innerText); } catch { await page.waitForTimeout(2000); text = await page.evaluate(() => document.body.innerText); }
        out.pages.push({ url: u, len: text.length, text: text.slice(0, 1500) });
      } catch (e) { out.pages.push({ url: u, error: String(e.message).slice(0, 120) }); }
    }
    return out;
  `;
  const r = await kernel.browsers.playwright.execute(b.session_id, { code, timeout_sec: 55 });
  console.log("success", r.success, r.error ?? "", `${Date.now() - t0}ms`);
  const res = r.result as { links: string[]; pages: { url: string; len?: number; text?: string; error?: string }[] };
  console.log("organic links:", res.links.slice(0, 6));
  for (const p of res.pages) console.log("\n---", p.url, p.len ?? p.error, "\n", (p.text ?? "").replace(/\s+/g, " ").slice(0, 900));
} finally {
  await kernel.browsers.deleteByID(b.session_id).catch(() => null);
}
