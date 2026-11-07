import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { aiConfigured } from "@/lib/ai";
import { isIndependent, priceHistory, searchProducts, type C3Offer } from "@/lib/channel3";
import { env } from "@/lib/env";
import { chooseOffers, describePhoto, draftPlan } from "./planner";
import { fallbackPlan } from "./fallback";
import type { PlanDraft } from "./schemas";

export type StepEvent =
  | { type: "step"; text: string; source?: string }
  | { type: "done" }
  | { type: "error"; message: string };

type Emit = (e: StepEvent) => void;

/**
 * The LifeCart planning agent:
 *  1. (photo) describe it with the vision model
 *  2. draft a need-based plan from the user's situation (Groq gpt-oss-120b)
 *  3. search real offers for every product (Channel3)
 *  4. pick the genuinely matching offer per item (Groq gpt-oss-20b)
 *  5. pull 90-day price history for chosen offers (Channel3)
 *  6. save everything; checkout split follows from each item's payType
 */
export async function runPlan(goalId: string, emit: Emit) {
  const db = await getDb();

  // Claim the goal so a double request (e.g. React dev double-effect) doesn't run the agent twice.
  const [goal] = await db
    .update(schema.goals)
    .set({ status: "running", error: null })
    .where(and(eq(schema.goals.id, goalId), eq(schema.goals.status, "draft")))
    .returning();
  if (!goal) return waitForOtherRun(goalId, emit);

  const steps: { text: string; source?: string }[] = [];
  const step = (text: string, source?: string) => {
    steps.push({ text, source });
    emit({ type: "step", text, source });
  };

  try {
    // 1. Photo
    let imageNote: string | null = null;
    if (goal.imageUrl && aiConfigured()) {
      imageNote = await describePhoto(goal.imageUrl).catch(() => null);
      if (imageNote) step(`Looked at your photo: ${imageNote}`);
    }

    // 2. Draft
    let plan: PlanDraft;
    if (aiConfigured()) {
      plan = await draftPlan({ prompt: goal.prompt, budget: goal.budgetCap ? Number(goal.budgetCap) : null, imageNote });
    } else {
      plan = fallbackPlan;
      step("AI key not set, so using the sample golden retriever plan.");
    }
    const flat = plan.groups.flatMap((g, gi) => g.items.map((it) => ({ ...normalize(it), group: g.title, groupWhy: g.why, gi })));
    step(`Read your situation: ${plan.context.join(", ")}.`);
    step(`Drafted ${flat.length} items across ${plan.groups.length} needs.`);

    // 3. Search offers
    const productIdx = flat.map((it, i) => (it.kind === "product" && it.searchQuery ? i : -1)).filter((i) => i >= 0);
    const offersByItem = new Map<number, C3Offer[]>();
    if (env.channel3ApiKey && productIdx.length) {
      const results = await Promise.all(productIdx.map((i) => searchProducts(flat[i].searchQuery, 4).catch(() => [])));
      productIdx.forEach((i, k) => offersByItem.set(i, results[k]));
      const all = results.flat();
      const stores = new Set(all.map((o) => o.domain));
      step(`Compared ${all.length} offers from ${stores.size} stores.`, "via Channel3");
    } else {
      step("Product search key not set, so prices are estimates.");
    }

    // 4. Choose offers
    const chosen = new Map<number, number | null>();
    const withOffers = productIdx.filter((i) => (offersByItem.get(i)?.length ?? 0) > 0);
    if (withOffers.length && aiConfigured()) {
      const picks = await chooseOffers(
        withOffers.map((i) => ({
          name: flat[i].name,
          searchQuery: flat[i].searchQuery,
          estimatedPrice: flat[i].estimatedPrice,
          offers: offersByItem.get(i)!,
        })),
      ).catch(() => new Map<number, number | null>());
      withOffers.forEach((i, k) => chosen.set(i, picks.has(k) ? picks.get(k)! : 0));
      const matched = [...chosen.values()].filter((v) => v != null).length;
      step(`Matched ${matched} of ${withOffers.length} products to the right listing.`);
    }

    // 5. Price history for chosen offers
    const histories = new Map<number, Awaited<ReturnType<typeof priceHistory>>>();
    const toHistory = [...chosen.entries()].filter(([, v]) => v != null) as [number, number][];
    if (toHistory.length) {
      const hs = await Promise.all(toHistory.map(([i, o]) => priceHistory(offersByItem.get(i)![o].productId)));
      toHistory.forEach(([i], k) => histories.set(i, hs[k]));
      const got = hs.filter((h) => h && h.points.length).length;
      step(`Checked 90-day price history for ${got} items.`, "via Channel3");
    }

    // 6. Save
    await db.delete(schema.planItems).where(eq(schema.planItems.goalId, goalId));
    let sort = 0;
    for (const [i, it] of flat.entries()) {
      const [row] = await db
        .insert(schema.planItems)
        .values({
          goalId,
          name: it.name,
          category: it.group,
          categoryWhy: it.groupWhy,
          reason: it.reason,
          kind: it.kind,
          cadence: it.cadence,
          searchQuery: it.searchQuery || null,
          estimatedPrice: String(it.estimatedPrice),
          qty: it.qty,
          priority: it.priority,
          payType: it.payType,
          targetPrice: it.targetPrice != null ? String(it.targetPrice) : null,
          sort: sort++,
        })
        .returning();

      const offers = offersByItem.get(i) ?? [];
      const pick = chosen.get(i);
      let chosenId: string | null = null;

      if (offers.length && pick != null) {
        // chosen offer first, then the alternatives
        const ordered = [offers[pick], ...offers.filter((_, j) => j !== pick)];
        for (const [rank, o] of ordered.entries()) {
          const h = rank === 0 ? histories.get(i) : null;
          const [off] = await db
            .insert(schema.offers)
            .values({
              planItemId: row.id,
              offerKey: o.productId,
              merchant: o.domain,
              title: o.title,
              url: o.url,
              imageUrl: o.imageUrl ?? null,
              price: String(o.price),
              wasPrice: o.wasPrice && o.wasPrice > o.price ? String(o.wasPrice) : null,
              isSmb: isIndependent(o.domain),
              availability: o.availability ?? null,
              priceStatus: h?.status ?? null,
              stats: h?.stats ?? null,
              rank,
              source: "channel3",
            })
            .returning();
          if (rank === 0) chosenId = off.id;
          if (h?.points.length) {
            await db
              .insert(schema.priceSnapshots)
              .values(h.points.map((p) => ({ offerKey: o.productId, price: String(p.price), capturedAt: new Date(p.at), source: "channel3" })));
          }
        }
      } else {
        // Services, or products with no good listing: an honest estimate.
        const [off] = await db
          .insert(schema.offers)
          .values({
            planItemId: row.id,
            offerKey: `estimate:${row.id}`,
            merchant: it.provider || (it.kind === "service" ? "Local provider" : "Estimate"),
            title: it.name,
            price: String(it.estimatedPrice),
            isSmb: it.kind === "service",
            source: "estimate",
          })
          .returning();
        chosenId = off.id;
      }
      await db.update(schema.planItems).set({ chosenOfferId: chosenId }).where(eq(schema.planItems.id, row.id));
    }

    step("Split payment across PayPal Orders, Subscriptions and Invoices.");
    await db
      .update(schema.goals)
      .set({ status: "ready", title: plan.title, summary: plan.summary, context: plan.context, steps })
      .where(eq(schema.goals.id, goalId));
    emit({ type: "done" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.update(schema.goals).set({ status: "draft", error: message, steps }).where(eq(schema.goals.id, goalId));
    emit({ type: "error", message: friendlyError(message) });
  }
}

/** Keep payment rails consistent no matter what the model returned. */
function normalize<T extends { kind: string; payType: string; cadence: string; priority: string; targetPrice: number | null; searchQuery: string }>(it: T): T {
  const x = { ...it };
  if (x.kind === "service") {
    x.payType = "invoice"; // people are paid by invoice, never "watched" or subscribed
    x.searchQuery = "";
    x.targetPrice = null;
  } else {
    if (x.payType === "invoice") x.payType = x.cadence === "monthly" ? "subscription" : "order";
    if (x.payType === "subscription") x.cadence = "monthly";
    if (x.payType === "watch") x.priority = "can_wait";
  }
  if (x.payType !== "watch") x.targetPrice = null;
  return x;
}

async function waitForOtherRun(goalId: string, emit: Emit) {
  const db = await getDb();
  for (let i = 0; i < 90; i++) {
    const [g] = await db.select().from(schema.goals).where(eq(schema.goals.id, goalId));
    if (!g) return emit({ type: "error", message: "Plan not found." });
    if (g.status === "ready") return emit({ type: "done" });
    if (g.status === "draft" && g.error) return emit({ type: "error", message: friendlyError(g.error) });
    await new Promise((r) => setTimeout(r, 1500));
  }
  emit({ type: "error", message: "The planner is taking too long. Please try again." });
}

function friendlyError(m: string) {
  if (/rate limit|429|tokens per/i.test(m)) return "The free AI tier is busy for a moment. Wait about a minute and try again.";
  return "Something went wrong while planning. Please try again.";
}
