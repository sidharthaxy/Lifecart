import { and, eq, lt, or } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { aiConfigured } from "@/lib/ai";
import { isIndependent, priceHistory, searchProducts, type C3Offer } from "@/lib/channel3";
import { env } from "@/lib/env";
import { BudgetError, canSpend, TimeoutError } from "@/lib/usage";
import { isBlockedItem } from "@/lib/guard/check";
import { chooseOffers, describePhoto, draftPlan } from "./planner";
import { fallbackPlan } from "./fallback";
import type { PlanDraft } from "./schemas";

export type StepEvent =
  | { type: "step"; text: string; source?: string }
  | { type: "ping" }
  | { type: "done" }
  | { type: "error"; message: string };

/** Hard ceiling for one agent run. Each external call also has its own timeout (see lib/usage, lib/ai). */
export const RUN_DEADLINE_MS = 180_000;

type Emit = (e: StepEvent) => void;

/**
 * The LifeCart planning agent. A fixed, bounded pipeline (no open-ended loops):
 *  0. (before this) up to 3 clarifying questions, see clarify.ts
 *  1. (photo) describe it with the vision model (cached from the questions step)
 *  2. draft a need-based plan from the situation + answers         1 Groq call
 *  3. search real offers for every product                          N Channel3 searches
 *  4. pick the genuinely matching offer per item                    1 Groq call
 *     + one broader retry search for unmatched items              ≤N searches, ≤1 Groq call
 *  5. pull 90-day price history for chosen offers                   ≤N Channel3 calls
 *  6. save everything; checkout split follows from each item's payType
 * Worst case: 3 Groq calls and ~3N Channel3 credits. Every call has a timeout, the whole run has
 * RUN_DEADLINE_MS, and a run that crashed is reclaimed after the deadline.
 */
export async function runPlan(goalId: string, emit: Emit) {
  const db = await getDb();

  // Claim the goal so a double request doesn't run the agent twice. A "running" goal whose run started
  // longer ago than the deadline is a crashed run (server restart etc.) and may be reclaimed.
  const stale = new Date(Date.now() - RUN_DEADLINE_MS - 30_000);
  const [goal] = await db
    .update(schema.goals)
    .set({ status: "running", error: null, runStartedAt: new Date() })
    .where(
      and(
        eq(schema.goals.id, goalId),
        or(eq(schema.goals.status, "draft"), and(eq(schema.goals.status, "running"), lt(schema.goals.runStartedAt, stale))),
      ),
    )
    .returning();
  if (!goal) return waitForOtherRun(goalId, emit);

  const startedAt = Date.now();
  const checkDeadline = () => {
    if (Date.now() - startedAt > RUN_DEADLINE_MS) throw new TimeoutError("Planning run exceeded its deadline");
  };

  const steps: { text: string; source?: string }[] = [];
  const step = (text: string, source?: string) => {
    steps.push({ text, source });
    emit({ type: "step", text, source });
  };

  try {
    // A plan needs up to 3 AI calls; refuse up front rather than fail halfway.
    if (aiConfigured() && !(await canSpend("groq", { calls: 3 }))) throw new BudgetError("groq");

    // 1. Photo (usually already described during the questions step)
    let imageNote: string | null = goal.imageNote;
    if (goal.imageUrl && !imageNote && aiConfigured()) imageNote = await describePhoto(goal.imageUrl).catch(() => null);
    if (imageNote) step(`Looked at your photo: ${imageNote}`);

    // Follow-up answers
    const qa = (goal.questions ?? [])
      .map((q) => ({ question: q.question, answer: goal.answers?.[q.id] ?? "" }))
      .filter((x) => x.answer);
    if (qa.length) step(`Used your answers: ${qa.map((x) => x.answer).join("; ")}.`);

    // 2. Draft
    let plan: PlanDraft;
    if (aiConfigured()) {
      plan = await draftPlan({ prompt: goal.prompt, budget: goal.budgetCap ? Number(goal.budgetCap) : null, imageNote, qa });
    } else {
      plan = fallbackPlan;
      step("AI key not set, so using the sample golden retriever plan.");
    }
    const drafted = plan.groups.flatMap((g, gi) => g.items.map((it) => ({ ...normalize(it), group: g.title, groupWhy: g.why, gi })));
    // Guard layer 5: drop anything prohibited that slipped past the input checks.
    const flat = drafted.filter((it) => !isBlockedItem(`${it.name} ${it.searchQuery} ${it.provider}`));
    if (flat.length < drafted.length) step(`Removed ${drafted.length - flat.length} item(s) LifeCart can't help buy.`);
    if (!flat.length) throw new Error("Nothing left to plan after safety checks");
    step(`Read your situation: ${plan.context.join(", ")}.`);
    step(`Drafted ${flat.length} ${flat.length === 1 ? "item" : "items"} across ${plan.groups.length} ${plan.groups.length === 1 ? "need" : "needs"}.`);
    checkDeadline();

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

    checkDeadline();
    // 4. Choose offers (then one broader retry search for anything unmatched)
    const chosen = new Map<number, number | null>();
    const match = async (idx: number[]) => {
      const withOffers = idx.filter((i) => (offersByItem.get(i)?.length ?? 0) > 0);
      if (!withOffers.length || !aiConfigured()) return;
      const picks = await chooseOffers(
        withOffers.map((i) => ({
          name: flat[i].name,
          searchQuery: flat[i].searchQuery,
          estimatedPrice: flat[i].estimatedPrice,
          offers: offersByItem.get(i)!,
        })),
      ).catch(() => new Map<number, number | null>());
      withOffers.forEach((i, k) => {
        const pick = picks.has(k) ? picks.get(k)! : null;
        const offer = pick == null ? null : offersByItem.get(i)![pick];
        // Sanity check: a price far from the typical one usually means the wrong product (or an accessory).
        const est = flat[i].estimatedPrice;
        const plausible = offer && est > 0 && offer.price >= est * 0.33 && offer.price <= est * 3;
        chosen.set(i, plausible ? pick : null);
      });
    };
    await match(productIdx);

    const unmatched = productIdx.filter((i) => chosen.get(i) == null);
    if (unmatched.length && env.channel3ApiKey) {
      // Plain item name, minus parenthetical specs, is often a broader query that finds the product.
      const retry = await Promise.all(
        unmatched.map((i) => searchProducts(flat[i].name.replace(/\(.*?\)/g, "").trim(), 4).catch(() => [])),
      );
      unmatched.forEach((i, k) => offersByItem.set(i, retry[k]));
      await match(unmatched);
    }
    if (productIdx.length && aiConfigured()) {
      const matched = productIdx.filter((i) => chosen.get(i) != null).length;
      step(
        `Matched ${matched} of ${productIdx.length} products to the right listing${unmatched.length ? ` (searched again for ${unmatched.length})` : ""}.`,
      );
    }

    checkDeadline();
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
      // The model set watch targets from its own estimate; re-anchor them to the real price we found.
      const realPrice = chosen.get(i) != null ? offersByItem.get(i)![chosen.get(i)!].price : null;
      if (it.payType === "watch" && realPrice && (it.targetPrice == null || it.targetPrice >= realPrice)) {
        it.targetPrice = Math.round(realPrice * 0.85 * 100) / 100;
      }
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
function normalize<T extends { kind: string; payType: string; cadence: string; priority: string; targetPrice: number | null; searchQuery: string; qty: number }>(it: T): T {
  const x = { ...it };
  if (x.kind === "service") {
    x.payType = "invoice"; // people are paid by invoice, never "watched" or subscribed
    x.qty = 1; // the service price is already the full amount
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

/** Another request is already running this plan: follow it (bounded) instead of starting a second run. */
async function waitForOtherRun(goalId: string, emit: Emit) {
  const db = await getDb();
  const until = Date.now() + RUN_DEADLINE_MS + 15_000;
  let n = 0;
  while (Date.now() < until) {
    const [g] = await db.select().from(schema.goals).where(eq(schema.goals.id, goalId));
    if (!g) return emit({ type: "error", message: "Plan not found." });
    if (g.status === "ready") return emit({ type: "done" });
    if (g.status === "blocked") return emit({ type: "error", message: g.error ?? "This request can't be planned." });
    if (g.status === "draft") return emit({ type: "error", message: g.error ? friendlyError(g.error) : "Planning stopped. Please try again." });
    if (++n % 5 === 0) emit({ type: "ping" }); // keep the browser's silence timer happy
    await new Promise((r) => setTimeout(r, 2000));
  }
  emit({ type: "error", message: "The planner is taking too long. Please try again." });
}

function friendlyError(m: string) {
  if (/budget reached/i.test(m)) return "Today's free AI and search allowance is nearly used up, so planning is paused to protect the demo. It resets at midnight UTC.";
  if (/rate limit|429|tokens per/i.test(m)) return "The free AI tier is busy for a moment. Wait about a minute and try again.";
  if (/timed out|deadline|aborted|timeout/i.test(m)) return "A service took too long to answer. Please try again.";
  return "Something went wrong while planning. Please try again.";
}
