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
  const allOrders = items.filter((i) => i.payType === "order");
  const orders = allOrders.filter((i) => !i.purchased);
  const subs = items.filter((i) => i.payType === "subscription");
  const allInvOnce = items.filter((i) => i.payType === "invoice" && i.cadence !== "monthly");
  const invOnce = allInvOnce.filter((i) => !i.purchased);
  const invMonthly = items.filter((i) => i.payType === "invoice" && i.cadence === "monthly");
  const watch = items.filter((i) => i.payType === "watch");
  const sum = (xs: ItemView[]) => xs.reduce((a, i) => a + line(i), 0);
  const belowList = items
    .filter((i) => i.payType !== "watch" && i.offer?.wasPrice)
    .reduce((a, i) => a + (i.offer!.wasPrice! - i.offer!.price) * i.qty, 0);

  const buyNow = sum(orders) + sum(invOnce);
  const paid = sum(allOrders.filter((i) => i.purchased)) + sum(allInvOnce.filter((i) => i.purchased));
  const monthly = sum(subs) + sum(invMonthly);
  return {
    buyNow,
    paid,
    monthly,
    firstMonth: buyNow + paid + monthly,
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
