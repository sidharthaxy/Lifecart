import { Channel3 } from "@channel3/sdk";
import { env } from "./env";
import { canSpend, record, withTimeout } from "./usage";

const REQ = { timeoutInSeconds: 15, maxRetries: 1 };

/**
 * Thin wrapper over the official Channel3 SDK.
 * Notes (verified Nov 7): request fields are snake_case, search results live at
 * `res.response.products`, each product has `offers[]` with {domain, price{price, compare_at_price}}.
 */
let client: Channel3 | null = null;
const c3 = () => (client ??= new Channel3({ apiKey: env.channel3ApiKey! } as ConstructorParameters<typeof Channel3>[0]));

export type C3Offer = {
  productId: string;
  title: string;
  imageUrl?: string;
  domain: string;
  url: string;
  price: number;
  wasPrice?: number;
  availability?: string;
};

/** Big national retailers; anything else is shown as an "Independent store". */
const BIG_BOX = [
  "amazon.", "walmart.", "target.", "chewy.", "petsmart.", "petco.", "bestbuy.", "homedepot.", "lowes.",
  "costco.", "qvc.", "wayfair.", "ebay.", "kohls.", "macys.", "samsclub.", "bjs.", "tractorsupply.", "overstock.",
  // brand-owned stores and other national chains
  "apple.", "samsung.", "google.", "microsoft.", "dell.", "hp.", "lenovo.", "sony.", "bose.", "nike.", "adidas.",
  "ikea.", "staples.", "officedepot.", "adorama.", "bhphotovideo.", "newegg.", "nordstrom.", "jcpenney.", "dickssportinggoods.",
  "rei.", "kroger.", "cvs.", "walgreens.", "ulta.", "sephora.", "gap.", "oldnavy.", "hm.", "zara.", "uniqlo.", "bedbathandbeyond.",
  "potterybarn.", "westelm.", "crateandbarrel.", "williams-sonoma.", "lego.", "toysrus.", "gamestop.", "petsupermarket.", "fivebelow.",
];
export const isIndependent = (domain: string) => !BIG_BOX.some((b) => domain.includes(b));

/** US storefronts only: drop .ca / .co.uk etc. */
const isUsDomain = (d: string) => d.endsWith(".com") || d.endsWith(".us") || d.endsWith(".net") || d.endsWith(".shop");

type RawOffer = {
  url?: string;
  domain?: string;
  price?: { price?: number; compare_at_price?: number | null; currency?: string };
  availability?: string;
};
type RawProduct = { id: string; title?: string; images?: { url?: string }[]; offers?: RawOffer[] };

/** Search US offers. Returns [] (never throws) when over today's credit cap, so plans degrade to estimates. */
export async function searchProducts(query: string, limit = 5): Promise<C3Offer[]> {
  if (!(await canSpend("channel3", { units: 1 }))) return [];
  await record("channel3", { units: 1 });
  const res = (await withTimeout(
    c3().products.search({ query, limit, config: { country: "US", currency: "USD" } } as never, REQ as never),
    18_000,
    "Product search",
  )) as unknown as { response?: { products?: RawProduct[] } };

  const out: C3Offer[] = [];
  for (const p of res.response?.products ?? []) {
    // One offer per product: the cheapest US, in-stock-ish offer.
    const offers = (p.offers ?? [])
      .filter((o) => o.domain && o.url && typeof o.price?.price === "number" && o.price?.currency !== "CAD")
      .filter((o) => isUsDomain(o.domain!))
      .sort((a, b) => a.price!.price! - b.price!.price!);
    const o = offers.find((x) => x.availability !== "OutOfStock") ?? offers[0];
    if (!o) continue;
    out.push({
      productId: p.id,
      title: p.title ?? "Untitled product",
      imageUrl: p.images?.[0]?.url,
      domain: o.domain!.replace(/^www\./, ""),
      url: o.url!,
      price: o.price!.price!,
      wasPrice: o.price!.compare_at_price ?? undefined,
      availability: o.availability,
    });
  }
  return out;
}

export type PriceHistory = {
  points: { at: string; price: number }[];
  status?: string;
  stats: { min?: number; max?: number; mean?: number; current?: number };
};

export async function priceHistory(productId: string, days = 90): Promise<PriceHistory | null> {
  if (!(await canSpend("channel3", { units: 1 }))) return null;
  try {
    await record("channel3", { units: 1 });
    const h = (await withTimeout(
      c3().priceTracking.retrieveHistory({ canonical_product_id: productId, days }, REQ as never),
      12_000,
      "Price history",
    )) as unknown as {
      history?: { timestamp: string; price: number }[];
      statistics?: { min_price?: number; max_price?: number; mean?: number; current_price?: number; current_status?: string } | null;
    };
    const s = h.statistics ?? {};
    return {
      points: (h.history ?? []).map((p) => ({ at: p.timestamp, price: p.price })),
      status: s.current_status,
      stats: { min: s.min_price, max: s.max_price, mean: s.mean, current: s.current_price },
    };
  } catch {
    return null; // history is a nice-to-have; never fail the plan over it
  }
}

/**
 * Today's price for a product at a specific store (price watch). Falls back to the price-history "current" value.
 * Returns null when unknown or over today's credit cap.
 */
export async function currentPrice(productId: string, domain: string): Promise<number | null> {
  if (!env.channel3ApiKey || !(await canSpend("channel3", { units: 1 }))) return null;
  try {
    await record("channel3", { units: 1 });
    const p = (await withTimeout(
      c3().products.retrieve({ product_id: productId, website_ids: [domain], country: "US", currency: "USD" } as never, REQ as never),
      12_000,
      "Price check",
    )) as unknown as RawProduct;
    const prices = (p.offers ?? [])
      .filter((o) => !o.domain || o.domain.replace(/^www\./, "") === domain)
      .map((o) => o.price?.price)
      .filter((n): n is number => typeof n === "number");
    if (prices.length) return Math.min(...prices);
  } catch {
    // fall through to history
  }
  const h = await priceHistory(productId, 7);
  return h?.stats.current ?? null;
}
