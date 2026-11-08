import { and, asc, eq, isNull } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { createWatchApproval, markApprovalsSent } from "./approvals";
import { currentPrice } from "./channel3";
import { num } from "./format";
import { alertNumber, sendWhatsApp, type SendResult } from "./whatsapp";
import { getUserById } from "./users";

/**
 * Price watch. For every watched, unbought product: look up today's price at its store (Channel3) and record it.
 * An alert needs a REAL drop: lower than the last price we saw AND at or below the target.
 * All drops found in one run go out as ONE WhatsApp digest (max MAX_ALERTS items), each with a link back to the
 * app to buy it with PayPal. Per item, at most one alert per 24 hours. LifeCart never buys on its own.
 */
const MAX_PER_RUN = 25;
const MAX_ALERTS = 3;

export type WatchResult = {
  itemId: string;
  name: string;
  merchant: string;
  was: number | null;
  now: number | null;
  target: number;
  status: "hit" | "watching" | "unknown" | "skipped" | "retargeted";
  link?: string;
  note?: string;
};

export async function listWatched(userId: string) {
  const db = await getDb();
  return db
    .select({ item: schema.planItems, offer: schema.offers, goal: schema.goals })
    .from(schema.planItems)
    .innerJoin(schema.goals, eq(schema.goals.id, schema.planItems.goalId))
    .leftJoin(schema.offers, eq(schema.offers.id, schema.planItems.chosenOfferId))
    .where(and(eq(schema.goals.userId, userId), eq(schema.planItems.payType, "watch"), eq(schema.planItems.kind, "product"), isNull(schema.planItems.purchasedAt)))
    .orderBy(asc(schema.planItems.lastCheckedAt));
}

/**
 * Check prices now. `simulateItemId` (demo only) pretends that one item dropped just below its target, so the
 * alert -> WhatsApp -> PayPal flow can be shown without waiting for a real sale.
 */
export async function checkWatches(origin: string, opts: { userId: string; simulateItemId?: string }): Promise<{ results: WatchResult[]; whatsapp: SendResult | null }> {
  const db = await getDb();
  const rows = (await listWatched(opts.userId)).filter((r) => !opts.simulateItemId || r.item.id === opts.simulateItemId).slice(0, MAX_PER_RUN);
  const results: WatchResult[] = [];
  const alerts: { approvalId: string; line: string }[] = [];

  for (const { item, offer } of rows) {
    const target = num(item.targetPrice);
    const merchant = offer?.merchant ?? "store";
    const was = num(item.lastPrice) ?? num(offer?.price);
    const base = { itemId: item.id, name: item.name, merchant, was, target: target ?? 0 };
    if (target == null || was == null) {
      results.push({ ...base, now: null, status: "skipped" });
      continue;
    }

    const simulated = opts.simulateItemId === item.id;
    const now = simulated
      ? Math.round(Math.min(target, was) * 0.96 * 100) / 100
      : offer?.source === "channel3"
        ? await currentPrice(offer.offerKey, offer.merchant)
        : null;
    if (now == null) {
      await db.update(schema.planItems).set({ lastCheckedAt: new Date() }).where(eq(schema.planItems.id, item.id));
      results.push({ ...base, now, status: "unknown" });
      continue;
    }
    if (offer?.offerKey && !simulated) await db.insert(schema.priceSnapshots).values({ offerKey: offer.offerKey, price: String(now), source: "live" });

    const dropped = now < was - 0.005;
    if (now <= target && !dropped) {
      // Already at/below target without a drop: the target was set wrong. Re-anchor it instead of alerting.
      const t = Math.round(now * 0.85 * 100) / 100;
      await db.update(schema.planItems).set({ lastCheckedAt: new Date(), lastPrice: String(now), targetPrice: String(t) }).where(eq(schema.planItems.id, item.id));
      results.push({ ...base, now, target: t, status: "retargeted", note: "target reset below today's price" });
      continue;
    }
    // Simulated drops don't overwrite the real last-seen price.
    await db
      .update(schema.planItems)
      .set({ lastCheckedAt: new Date(), ...(simulated ? {} : { lastPrice: String(now) }) })
      .where(eq(schema.planItems.id, item.id));

    if (dropped && now <= target && alerts.length < MAX_ALERTS) {
      const a = await createWatchApproval({ itemId: item.id, now, was, target }, origin);
      if ("skipped" in a) results.push({ ...base, now, status: "hit", note: a.skipped });
      else {
        alerts.push({ approvalId: a.approvalId, line: a.line });
        results.push({ ...base, now, status: "hit", link: a.link });
      }
    } else {
      results.push({ ...base, now, status: "watching" });
    }
  }

  let whatsapp: SendResult | null = null;
  if (alerts.length) {
    const msg = [
      `*LifeCart price drop${alerts.length > 1 ? "s" : ""}* 📉`,
      "",
      ...alerts.map((a) => a.line),
      "",
      "Tap a link to buy with PayPal. Links are valid for 6 hours.",
    ].join("\n");
    whatsapp = await sendWhatsApp(msg, alertNumber(await getUserById(opts.userId)));
    await markApprovalsSent(
      alerts.map((a) => a.approvalId),
      whatsapp.sent ? whatsapp.sid : null,
    );
  }
  return { results, whatsapp };
}
