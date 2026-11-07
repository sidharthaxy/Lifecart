import { asc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { num } from "./format";
import { computeTotals } from "./totals";
export { computeTotals };

import type { ItemView, OfferView } from "./totals";
export type { ItemView, OfferView };

export type PlanView = Awaited<ReturnType<typeof getPlan>>;

export async function getPlan(goalId: string) {
  const db = await getDb();
  const [goal] = await db.select().from(schema.goals).where(eq(schema.goals.id, goalId));
  if (!goal) return null;

  const items = await db.select().from(schema.planItems).where(eq(schema.planItems.goalId, goalId)).orderBy(asc(schema.planItems.sort));
  const offers = items.length
    ? await db.select().from(schema.offers).where(inArray(schema.offers.planItemId, items.map((i) => i.id))).orderBy(asc(schema.offers.rank))
    : [];

  const toOffer = (o: (typeof offers)[number]): OfferView => ({
    id: o.id,
    merchant: o.merchant,
    title: o.title,
    url: o.url,
    imageUrl: o.imageUrl,
    price: num(o.price)!,
    wasPrice: num(o.wasPrice),
    independent: o.isSmb,
    availability: o.availability,
    priceStatus: o.priceStatus,
    stats: o.stats,
    source: o.source,
    productId: o.offerKey,
  });

  const chosenKeys = items
    .map((i) => offers.find((o) => o.id === i.chosenOfferId))
    .filter((o): o is (typeof offers)[number] => Boolean(o && o.source === "channel3"))
    .map((o) => o.offerKey);
  const snaps = chosenKeys.length
    ? await db.select().from(schema.priceSnapshots).where(inArray(schema.priceSnapshots.offerKey, chosenKeys)).orderBy(asc(schema.priceSnapshots.capturedAt))
    : [];

  const itemViews: ItemView[] = items.map((i) => {
    const mine = offers.filter((o) => o.planItemId === i.id);
    const chosen = mine.find((o) => o.id === i.chosenOfferId) ?? mine[0];
    const seen = new Set<string>();
    const history = chosen
      ? snaps
          .filter((s) => s.offerKey === chosen.offerKey)
          .filter((s) => {
            const k = s.capturedAt.toISOString().slice(0, 10);
            if (seen.has(k)) return false; // one point per day
            seen.add(k);
            return true;
          })
          .map((s) => ({ at: s.capturedAt.toISOString(), price: num(s.price)! }))
      : [];
    return {
      id: i.id,
      name: i.name,
      category: i.category,
      categoryWhy: i.categoryWhy,
      reason: i.reason,
      kind: i.kind,
      cadence: i.cadence,
      qty: i.qty,
      priority: i.priority,
      payType: i.payType,
      targetPrice: num(i.targetPrice),
      estimatedPrice: num(i.estimatedPrice),
      offer: chosen ? toOffer(chosen) : null,
      alternatives: mine.filter((o) => o.id !== chosen?.id).map(toOffer),
      history,
    };
  });

  return { goal: { ...goal, budgetCap: num(goal.budgetCap) }, items: itemViews, totals: computeTotals(itemViews) };
}

/** Recent plans for the landing page. */
export async function listPlans(limit = 5) {
  const db = await getDb();
  const goals = await db.select().from(schema.goals).orderBy(schema.goals.createdAt).limit(50);
  return goals.reverse().slice(0, limit);
}

export async function chooseOffer(itemId: string, offerId: string) {
  const db = await getDb();
  await db.update(schema.planItems).set({ chosenOfferId: offerId }).where(eq(schema.planItems.id, itemId));
}

/**
 * Move a product between "buy now" and "price watch". Services can't be watched.
 * Default target: the 90-day low if it's below today's price, else 15% off today's price.
 */
export async function setItemRail(itemId: string, watch: boolean, target?: number) {
  const db = await getDb();
  const [item] = await db.select().from(schema.planItems).where(eq(schema.planItems.id, itemId));
  if (!item) return { error: "Unknown item" };
  if (item.kind === "service") return { error: "Services are booked, not watched." };
  const [offer] = item.chosenOfferId ? await db.select().from(schema.offers).where(eq(schema.offers.id, item.chosenOfferId)) : [];
  const price = num(offer?.price) ?? num(item.estimatedPrice) ?? 0;

  if (watch) {
    const low = offer?.stats?.min;
    let t = target ?? (low && low < price * 0.98 ? low : price * 0.85);
    t = Math.round(Math.min(Math.max(t, 1), price) * 100) / 100;
    await db.update(schema.planItems).set({ payType: "watch", priority: "can_wait", targetPrice: String(t) }).where(eq(schema.planItems.id, itemId));
    return { payType: "watch" as const, targetPrice: t };
  }
  const payType = item.cadence === "monthly" ? ("subscription" as const) : ("order" as const);
  await db.update(schema.planItems).set({ payType, priority: "now", targetPrice: null }).where(eq(schema.planItems.id, itemId));
  return { payType, targetPrice: null };
}
