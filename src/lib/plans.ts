import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { isIndependent } from "./channel3";
import { num } from "./format";
import { computeTotals } from "./totals";
export { computeTotals };

import type { ItemView, OfferView } from "./totals";
export type { ItemView, OfferView };

export type PlanView = Awaited<ReturnType<typeof getPlan>>;

export async function getPlan(goalId: string, userId: string) {
  const db = await getDb();
  const [goal] = await db.select().from(schema.goals).where(and(eq(schema.goals.id, goalId), eq(schema.goals.userId, userId)));
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
    independent: o.source === "channel3" ? isIndependent(o.merchant) : o.isSmb,
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
      purchased: Boolean(i.purchasedAt),
      lastPrice: num(i.lastPrice),
      lastCheckedAt: i.lastCheckedAt ? i.lastCheckedAt.toISOString() : null,
    };
  });

  return { goal: { ...goal, budgetCap: num(goal.budgetCap) }, items: itemViews, totals: computeTotals(itemViews) };
}

/** Your plans, newest first. */
export async function listPlans(userId: string, limit = 5) {
  const db = await getDb();
  return db.select().from(schema.goals).where(eq(schema.goals.userId, userId)).orderBy(desc(schema.goals.createdAt)).limit(limit);
}

/** Does this plan belong to this user? (API routes and actions check before touching a plan.) */
export async function ownsGoal(goalId: string, userId: string) {
  const db = await getDb();
  const [g] = await db.select({ id: schema.goals.id }).from(schema.goals).where(and(eq(schema.goals.id, goalId), eq(schema.goals.userId, userId)));
  return Boolean(g);
}

/** The plan item, only if it belongs to one of this user's plans. */
async function ownedItem(itemId: string, userId: string) {
  const db = await getDb();
  const [row] = await db
    .select({ item: schema.planItems })
    .from(schema.planItems)
    .innerJoin(schema.goals, eq(schema.goals.id, schema.planItems.goalId))
    .where(and(eq(schema.planItems.id, itemId), eq(schema.goals.userId, userId)));
  return row?.item ?? null;
}

export async function chooseOffer(itemId: string, offerId: string, userId: string) {
  if (!(await ownedItem(itemId, userId))) return;
  const db = await getDb();
  const [offer] = await db.select({ id: schema.offers.id }).from(schema.offers).where(and(eq(schema.offers.id, offerId), eq(schema.offers.planItemId, itemId)));
  if (!offer) return;
  await db.update(schema.planItems).set({ chosenOfferId: offerId }).where(eq(schema.planItems.id, itemId));
}

/**
 * Move a product between "buy now" and "price watch". Services can't be watched.
 * Default target: the 90-day low if it's below today's price, else 15% off today's price.
 */
export async function setItemRail(itemId: string, watch: boolean, target: number | undefined, userId: string) {
  const db = await getDb();
  const item = await ownedItem(itemId, userId);
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
