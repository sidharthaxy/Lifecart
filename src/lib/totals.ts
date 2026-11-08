/** Pure plan math + view types, shared by server and client. */

export type OfferView = {
  id: string;
  merchant: string;
  title: string;
  url: string | null;
  imageUrl: string | null;
  price: number;
  wasPrice: number | null;
  independent: boolean;
  availability: string | null;
  priceStatus: string | null;
  stats: { min?: number; max?: number; mean?: number; current?: number } | null;
  source: string;
  productId: string;
};

export type ItemView = {
  id: string;
  name: string;
  category: string;
  categoryWhy: string | null;
  reason: string;
  kind: string;
  cadence: string;
  qty: number;
  priority: string;
  payType: "order" | "subscription" | "invoice" | "watch";
  targetPrice: number | null;
  estimatedPrice: number | null;
  offer: OfferView | null;
  alternatives: OfferView[];
  history: { at: string; price: number }[];
  /** Paid with PayPal already; never charged again. */
  purchased: boolean;
  /** Price watch: latest live price and when it was checked. */
  lastPrice: number | null;
  lastCheckedAt: string | null;
};

export function computeTotals(items: ItemView[]) {
  // A service price is already the full (monthly) amount; quantity only multiplies products.
  const line = (i: ItemView) => (i.offer?.price ?? i.estimatedPrice ?? 0) * (i.kind === "service" ? 1 : i.qty);
  // Anything already bought counts as paid (whatever its payment type) and is left out of everything still to pay.
  const bought = items.filter((i) => i.purchased);
  const open = items.filter((i) => !i.purchased);
  const orders = open.filter((i) => i.payType === "order");
  const subs = open.filter((i) => i.payType === "subscription");
  const invOnce = open.filter((i) => i.payType === "invoice" && i.cadence !== "monthly");
  const invMonthly = open.filter((i) => i.payType === "invoice" && i.cadence === "monthly");
  const watch = open.filter((i) => i.payType === "watch");
  const sum = (xs: ItemView[]) => xs.reduce((a, i) => a + line(i), 0);
  const belowList = open
    .filter((i) => i.payType !== "watch" && i.offer?.wasPrice)
    .reduce((a, i) => a + (i.offer!.wasPrice! - i.offer!.price) * i.qty, 0);

  const buyNow = sum(orders) + sum(invOnce);
  const paid = sum(bought);
  /** First month of refills/services not paid yet (charged at checkout). */
  const monthlyDue = sum(subs) + sum(invMonthly);
  /** Every month going forward: all refills and monthly services, including ones already set up. */
  const monthly = sum([...bought, ...open].filter((i) => i.payType === "subscription" || (i.payType === "invoice" && i.cadence === "monthly")));
  return {
    buyNow,
    paid,
    monthly,
    firstMonth: paid + buyNow + monthlyDue,
    watching: sum(watch),
    belowList,
    rails: {
      orders: { count: orders.length, stores: new Set(orders.map((i) => i.offer?.merchant)).size, total: sum(orders) },
      subscriptions: { count: subs.length, total: sum(subs) },
      invoices: { count: invOnce.length + invMonthly.length, once: sum(invOnce), monthly: sum(invMonthly) },
      watch: { count: watch.length, total: sum(watch) },
    },
  };
}

export type Totals = ReturnType<typeof computeTotals>;
