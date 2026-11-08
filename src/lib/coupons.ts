import Kernel from "@onkernel/sdk";
import { generateText, Output } from "ai";
import { and, desc, gt, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { guardedGroq, models } from "./ai";
import { env } from "./env";
import { cleanText, fence, UNTRUSTED_RULE } from "./guard/sanitize";
import { getPlan } from "./plans";
import { canSpend, record, withTimeout } from "./usage";

/**
 * Coupon finder (runs ONLY when the user presses "Find coupons" on a plan).
 *  1. Stores: the distinct stores of the plan's unbought items (max 3, biggest spend first).
 *  2. One Kernel cloud browser: for each store (in parallel tabs) search the web for "<store> promo code", skip ads,
 *     and read the store's own deals page plus up to 2 coupon sites.
 *  3. gpt-oss-20b pulls the offers out of that text. The pages are fenced as untrusted data; a code is kept only if it
 *     appears verbatim on the page it came from, and source links come from our own list, never the model.
 *  4. Results are saved per store and reused for 12 hours. Nothing is applied to payments automatically.
 * Bounded: 1 browser session per search, 45 s per store, Kernel and Groq daily caps, per-user rate limit.
 */

const MAX_STORES = 3;
const CACHE_MS = 12 * 60 * 60_000;
const PAGE_CHARS = 4000;
const COUPON_SITES = /retailcoupons|couponfollow|retailmenot|offers\.com|couponcabin|dealspotr|knoji|wethrift|couponbirds|slickdeals|groupon|savings\.com/;

export type CouponOffer = {
  id: string;
  title: string;
  discountText: string | null;
  code: string | null;
  terms: string | null;
  expires: string | null;
  sourceUrl: string | null;
  sourceName: string | null;
};
export type StoreCoupons = { domain: string; merchant: string; offers: CouponOffer[]; checkedAt: string | null; note?: string };

const hostOf = (url: string | null | undefined) => {
  try {
    return url ? new URL(url).hostname.replace(/^www\./, "") : null;
  } catch {
    return null;
  }
};
const siteName = (url: string) => {
  const h = hostOf(url) ?? "";
  const base = h.split(".").slice(-2, -1)[0] ?? h;
  return base.charAt(0).toUpperCase() + base.slice(1);
};

/** The stores in a plan worth searching (unbought, real listings), biggest spend first. */
async function planStores(goalId: string, userId: string) {
  const plan = await getPlan(goalId, userId);
  if (!plan) return null;
  const byDomain = new Map<string, { domain: string; merchant: string; spend: number }>();
  for (const i of plan.items) {
    if (i.purchased || i.kind === "service" || i.offer?.source !== "channel3") continue;
    // Channel3 links go through its own redirect host, so prefer the merchant name when it's a domain (it usually is).
    const fromName = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(i.offer.merchant.trim()) ? i.offer.merchant.trim().toLowerCase().replace(/^www\./, "") : null;
    const fromUrl = hostOf(i.offer.url);
    const domain = fromName ?? (fromUrl && !/trychannel3\.com$/.test(fromUrl) ? fromUrl : null);
    if (!domain) continue;
    const cur = byDomain.get(domain) ?? { domain, merchant: i.offer.merchant, spend: 0 };
    cur.spend += i.offer.price * i.qty;
    byDomain.set(domain, cur);
  }
  return [...byDomain.values()].sort((a, b) => b.spend - a.spend);
}

async function cached(domains: string[]) {
  if (!domains.length) return new Map<string, (typeof schema.coupons.$inferSelect)[]>();
  const db = await getDb();
  const rows = await db
    .select()
    .from(schema.coupons)
    .where(and(inArray(schema.coupons.domain, domains), gt(schema.coupons.foundAt, new Date(Date.now() - CACHE_MS))))
    .orderBy(desc(schema.coupons.foundAt));
  const map = new Map<string, typeof rows>();
  for (const r of rows) map.set(r.domain, [...(map.get(r.domain) ?? []), r]);
  return map;
}

const toOffer = (r: typeof schema.coupons.$inferSelect): CouponOffer => ({
  id: r.id,
  title: r.title,
  discountText: r.discountText,
  code: r.code,
  terms: r.terms,
  expires: r.expires,
  sourceUrl: r.sourceUrl,
  sourceName: r.sourceName,
});

/** What's already known for this plan's stores (no web search). Used to show results when the page loads. */
export async function couponsForPlan(goalId: string, userId: string): Promise<StoreCoupons[]> {
  const stores = (await planStores(goalId, userId))?.slice(0, MAX_STORES) ?? [];
  const known = await cached(stores.map((s) => s.domain));
  return stores
    .filter((s) => known.has(s.domain))
    .map((s) => {
      const rows = known.get(s.domain)!;
      const real = rows.filter((r) => r.title !== "__none__");
      return { domain: s.domain, merchant: s.merchant, offers: real.map(toOffer), checkedAt: rows[0].foundAt.toISOString() };
    });
}

// ---------------------------------------------------------------------------------------------------
// Web search in one Kernel browser

type Page = { url: string; text: string };

/** Runs inside Kernel's browser (Playwright). Returns the store's own deals page + up to 2 coupon-site pages. */
const browseCode = (domain: string) => `
  const domain = ${JSON.stringify(domain)};
  const sites = ${COUPON_SITES.toString()};
  const started = Date.now();
  const BUDGET = 34000; // return what we have before the 45 s executor limit
  const left = () => BUDGET - (Date.now() - started);
  const read = async (u) => {
    await page.goto(u, { waitUntil: "domcontentloaded", timeout: Math.max(3000, Math.min(10000, left())) });
    await page.waitForTimeout(1200);
    try { return await page.evaluate(() => document.body.innerText); }
    catch { await page.waitForTimeout(1000); return await page.evaluate(() => document.body.innerText); }
  };
  await page.goto("https://html.duckduckgo.com/html/?q=" + encodeURIComponent(domain + " promo code"), { waitUntil: "domcontentloaded", timeout: 10000 });
  const raw = await page.$$eval("a.result__a", (as) => as.map((a) => a.href));
  const links = [];
  for (const h of raw) {
    let u = h;
    try { const p = new URL(h); if (p.searchParams.get("uddg")) u = p.searchParams.get("uddg"); } catch {}
    if (!/^https:\\/\\//.test(u) || /duckduckgo\\.com\\/y\\.js|bing\\.com\\/aclick/.test(u)) continue; // ads
    if (!links.includes(u)) links.push(u);
  }
  // Coupon sites first (they list codes); the store's own deals page last, since big stores load slowly or block bots.
  const third = links.filter((u) => sites.test(new URL(u).hostname)).slice(0, 3);
  const own = links.filter((u) => new URL(u).hostname.replace(/^www\\./, "").endsWith(domain)).slice(0, 1);
  const pages = [];
  for (const u of [...third, ...own]) {
    if (pages.length >= 3 || left() < 5000) break;
    try {
      const text = (await read(u)).replace(/\\s+/g, " ");
      // Skip bot-check and error pages.
      if (text.length > 400 && !/verify you are human|access denied|enable javascript and cookies|just a moment/i.test(text.slice(0, 600)))
        pages.push({ url: u, text: text.slice(0, ${PAGE_CHARS}) });
    } catch {}
  }
  return pages;
`;

async function browseStores(domains: string[]): Promise<Map<string, Page[]>> {
  const out = new Map<string, Page[]>();
  if (!env.kernelApiKey || !domains.length) return out;
  if (!(await canSpend("kernel", { calls: 1 }))) throw new Error("Daily coupon-search limit reached. Try again tomorrow.");
  const kernel = new Kernel({ apiKey: env.kernelApiKey });
  const started = Date.now();
  const browser = await withTimeout(kernel.browsers.create({ stealth: true, headless: true, timeout_seconds: 120 }), 20_000, "Kernel browser");
  try {
    // One tab per store (named executors run in parallel).
    const results = await Promise.allSettled(
      domains.map((d, i) =>
        withTimeout(kernel.browsers.playwright.execute(browser.session_id, { code: browseCode(d), executor: `store${i}`, timeout_sec: 45 }), 55_000, "coupon search"),
      ),
    );
    results.forEach((r, i) => {
      if (r.status !== "fulfilled" || !r.value.success || !Array.isArray(r.value.result)) {
        const why = r.status === "rejected" ? String(r.reason) : (r.value.error ?? "no result");
        console.warn(`[coupons] ${domains[i]}: browser step failed: ${why.slice(0, 200)}`);
        return;
      }
      const pages = (r.value.result as Page[]).filter((p) => typeof p?.url === "string" && typeof p?.text === "string" && /^https:\/\//.test(p.url));
      out.set(domains[i], pages);
    });
  } finally {
    await kernel.browsers.deleteByID(browser.session_id).catch(() => null);
    await record("kernel", { calls: 1, units: Math.round((Date.now() - started) / 1000) });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------
// Extraction (fast model, untrusted input)

const offerSchema = z.object({
  offers: z
    .array(
      z.object({
        title: z.string().describe("Short description of the offer, as stated on the page"),
        discount: z.string().nullable().describe('e.g. "15% off", "$20 off", "Free shipping"; null if not stated'),
        code: z.string().nullable().describe("The promo code ONLY if it is printed in full on the page; otherwise null"),
        minSpend: z.string().nullable(),
        expires: z.string().nullable(),
        page: z.number().int().describe("Index of the page the offer came from"),
      }),
    )
    .max(8),
});

async function extractOffers(domain: string, merchant: string, pages: Page[]) {
  if (!pages.length) return [];
  const prompt = [
    `Store: ${merchant} (${domain}).`,
    "List the current discount offers for THIS store found in the pages below. Rules:",
    "- Only offers for this store. Skip cash-back, credit-card, gift-card resale and other stores' offers.",
    "- code: only if the full code is printed on the page. Codes hidden behind 'Show Code' or shown partially (masked) must be null.",
    "- Don't invent anything. If a detail isn't on the page, use null. At most 8 offers, best first.",
    "",
    ...pages.map((p, i) => fence(`page ${i}`, p.text)),
  ].join("\n");
  const { output } = await guardedGroq("fast", 4000, (abortSignal) =>
    generateText({
      abortSignal,
      model: models.fast(),
      system: `You extract store discount offers from web pages into JSON. ${UNTRUSTED_RULE}`,
      prompt,
      output: Output.object({ schema: offerSchema }),
      temperature: 0,
      maxOutputTokens: 2500,
      providerOptions: { groq: { reasoningEffort: "low" } },
      maxRetries: 1,
    }),
  );
  return output.offers.flatMap((o) => {
    const page = pages[o.page];
    if (!page) return [];
    const title = cleanText(o.title, 120);
    if (title.length < 4) return [];
    // A code is kept only if it's a plausible code AND appears verbatim on its source page.
    const code = o.code && /^[A-Za-z0-9-]{4,20}$/.test(o.code) && new RegExp(`(^|[^A-Za-z0-9])${o.code}([^A-Za-z0-9]|$)`).test(page.text) ? o.code : null;
    return [
      {
        title,
        discountText: o.discount ? cleanText(o.discount, 40) : null,
        code,
        terms: o.minSpend ? cleanText(`Min spend ${o.minSpend}`, 80) : null,
        expires: o.expires ? cleanText(o.expires, 40) : null,
        sourceUrl: page.url,
        sourceName: siteName(page.url),
      },
    ];
  });
}

// ---------------------------------------------------------------------------------------------------

/** "Find coupons": search the web for this plan's stores (reusing results younger than 12 hours). */
export async function findCoupons(goalId: string, userId: string): Promise<{ stores: StoreCoupons[]; searched: number } | { error: string }> {
  const all = await planStores(goalId, userId);
  if (!all) return { error: "Plan not found." };
  const stores = all.slice(0, MAX_STORES);
  if (!stores.length) return { error: "There are no store items left to find coupons for." };
  if (!env.kernelApiKey) return { error: "Coupon search isn't set up on this server." };

  const known = await cached(stores.map((s) => s.domain));
  const todo = stores.filter((s) => !known.has(s.domain));
  const db = await getDb();
  if (todo.length) {
    let pages: Map<string, Page[]>;
    try {
      pages = await browseStores(todo.map((s) => s.domain));
    } catch (e) {
      return { error: (e as Error).message.includes("limit") ? (e as Error).message : "The coupon search didn't finish. Try again in a minute." };
    }
    for (const s of todo) {
      const got = pages.get(s.domain) ?? [];
      let offers: Awaited<ReturnType<typeof extractOffers>> = [];
      let failed = got.length === 0;
      try {
        offers = await extractOffers(s.domain, s.merchant, got);
      } catch (e) {
        failed = true;
        console.warn(`[coupons] ${s.domain}: extraction failed: ${(e as Error).message.slice(0, 200)}`);
      }
      console.log(`[coupons] ${s.domain}: ${got.length} page(s) read (${got.map((p) => `${hostOf(p.url)} ${p.text.length}ch "${p.text.slice(0, 80)}"`).join(" | ")}), ${offers.length} offer(s)`);
      // A failed search isn't cached, so "Search again" really searches again. A real "nothing found" is remembered
      // as a marker row, so the same store isn't searched again for 12 hours.
      if (failed && !offers.length) continue;
      const rows = offers.length
        ? offers.map((o) => ({ ...o, domain: s.domain, merchant: s.merchant }))
        : [{ domain: s.domain, merchant: s.merchant, title: "__none__" }];
      await db.insert(schema.coupons).values(rows);
    }
  }
  const fresh = await cached(stores.map((s) => s.domain));
  return {
    searched: todo.length,
    stores: stores.map((s) => {
      const rows = fresh.get(s.domain) ?? [];
      const real = rows.filter((r) => r.title !== "__none__");
      return {
        domain: s.domain,
        merchant: s.merchant,
        offers: real.map(toOffer),
        checkedAt: rows[0]?.foundAt.toISOString() ?? null,
        note: rows.length ? undefined : "The search didn't return anything for this store.",
      };
    }),
  };
}
