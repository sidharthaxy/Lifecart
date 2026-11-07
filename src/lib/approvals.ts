import { createHash, randomBytes } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { ApprovalLine, ApprovalPayload, ApprovalResult } from "@/db/schema";
import { getDemoUser } from "./demo-user";
import { money } from "./format";
import {
  captureOrder,
  capturedTotal,
  createAndSendInvoice,
  createMonthlySubscription,
  createOrder,
  getOrder,
  getSubscription,
  PayPalError,
} from "./paypal";
import { getPlan } from "./plans";
import { sendWhatsApp, type SendResult } from "./whatsapp";

/**
 * Human-in-the-loop payment approvals.
 *
 * A cart approval freezes what will be paid (payload) and gets a single-use link token. Only the SHA-256 of the
 * token is stored. The link goes to WhatsApp; opening it shows the summary; "Continue with PayPal" runs:
 *
 *   order (PayPal Orders: create -> buyer approves on PayPal -> capture)
 *     -> subscription (PayPal Subscriptions: create -> buyer approves)   [if the plan has refills]
 *     -> invoices (PayPal Invoicing: create + send to the payer's email)  [if the plan has services]
 *     -> done (WhatsApp receipt)
 *
 * Each step is claimed with a conditional UPDATE on `step`, so a double tap or refresh can't capture twice.
 * Amounts always come from the payload, never from the browser or PayPal's redirect parameters.
 */

const LINK_TTL_MS = 30 * 60_000;
const hash = (t: string) => createHash("sha256").update(t).digest("hex");
const round = (n: number) => Math.round(n * 100) / 100;

export type Approval = typeof schema.approvals.$inferSelect;

// ---------------------------------------------------------------------------------------------------
// Create + send

/**
 * Freeze what will be paid and mint a single-use link.
 * In-app checkout uses notify=false (the user is already here and goes straight to PayPal).
 * notify=true sends the link over WhatsApp (used when LifeCart reaches out: price drops, bills, renewals).
 */
export async function createCartApproval(
  goalId: string,
  origin: string,
  opts: { notify: boolean } = { notify: false },
): Promise<{ token: string; link: string; message: string; whatsapp: SendResult | null } | { error: string }> {
  const plan = await getPlan(goalId).catch(() => null);
  if (!plan || plan.goal.status !== "ready") return { error: "This plan isn't ready to pay yet." };

  const line = (i: (typeof plan.items)[number]): ApprovalLine => ({
    itemId: i.id,
    name: i.name,
    merchant: i.offer?.source === "channel3" ? i.offer.merchant : (i.offer?.merchant ?? "LifeCart"),
    qty: i.kind === "service" ? 1 : i.qty,
    unit: round(i.offer?.price ?? i.estimatedPrice ?? 0),
  });
  const open = plan.items.filter((i) => !i.purchased); // never charge for something already bought
  const orders = open.filter((i) => i.payType === "order").map(line).filter((l) => l.unit > 0);
  const subscriptions = open.filter((i) => i.payType === "subscription").map(line).filter((l) => l.unit > 0);
  const invoices = open
    .filter((i) => i.payType === "invoice")
    .map((i) => ({ ...line(i), cadence: (i.cadence === "monthly" ? "monthly" : "one_time") as "monthly" | "one_time" }))
    .filter((l) => l.unit > 0);

  const orderTotal = round(orders.reduce((a, l) => a + l.unit * l.qty, 0));
  const subscriptionMonthly = round(subscriptions.reduce((a, l) => a + l.unit * l.qty, 0));
  if (!orders.length && !subscriptions.length && !invoices.length) return { error: "Everything in this plan is already paid or on price watch." };

  const user = await getDemoUser();
  const payload: ApprovalPayload = { goalId, orders, orderTotal, subscriptions, subscriptionMonthly, invoices, shipTo: user.shipTo ?? undefined };
  const token = randomBytes(24).toString("base64url");
  const db = await getDb();

  // Only one live checkout link per plan: retire older unpaid cart links (price-drop links stay valid).
  await db
    .update(schema.approvals)
    .set({ status: "expired", updatedAt: new Date() })
    .where(
      and(
        sql`${schema.approvals.payload}->>'goalId' = ${goalId}`,
        eq(schema.approvals.kind, "cart"),
        inArray(schema.approvals.status, ["pending", "sent"]),
      ),
    );

  const [approval] = await db
    .insert(schema.approvals)
    .values({
      userId: user.id,
      kind: "cart",
      amount: String(round(orderTotal + subscriptionMonthly)),
      title: plan.goal.title ?? "Your plan",
      payload,
      token: hash(token),
      expiresAt: new Date(Date.now() + LINK_TTL_MS),
      step: orders.length ? "order" : subscriptions.length ? "subscription" : "invoices",
    })
    .returning();

  const link = `${origin}/approve/${token}`;
  const stores = [...new Set(orders.map((o) => o.merchant))];
  const invoiceTotal = invoices.reduce((a, l) => a + l.unit, 0);
  const message = [
    `*LifeCart*: your ${approval.title.replace(/^your\s+/i, "")} is ready to pay.`,
    "",
    orders.length ? `${orders.length} item${orders.length > 1 ? "s" : ""} from ${stores.slice(0, 3).join(", ")}${stores.length > 3 ? "…" : ""}: ${money(orderTotal)}` : null,
    subscriptions.length ? `Monthly refills: ${money(subscriptionMonthly)}/mo` : null,
    invoices.length ? `Local services, invoiced separately: ${money(invoiceTotal)}` : null,
    "",
    `*Due on approval: ${money(orderTotal + subscriptionMonthly)}*`,
    "",
    "Review & Pay (link valid 30 min):",
    link,
  ]
    .filter((x) => x !== null)
    .join("\n");

  if (!opts.notify) return { token, link, message, whatsapp: null };
  const whatsapp = await sendWhatsApp(message);
  await db
    .update(schema.approvals)
    .set({ status: whatsapp.sent ? "sent" : "pending", whatsappMessageId: whatsapp.sent ? whatsapp.sid : null, updatedAt: new Date() })
    .where(eq(schema.approvals.id, approval.id));
  return { token, link, message, whatsapp };
}

const WATCH_LINK_TTL_MS = 6 * 60 * 60_000; // price-drop links stay valid for 6 hours

/**
 * A watched item really dropped to its target: mint a single-item approval at the new price.
 * Does NOT message anyone; the price check sends one WhatsApp digest per run (see lib/watch.ts).
 * Cooldown: at most one alert per item per 24 hours.
 */
export async function createWatchApproval(
  input: { itemId: string; now: number; was: number; target: number },
  origin: string,
): Promise<{ approvalId: string; link: string; line: string } | { skipped: string }> {
  const db = await getDb();
  const [item] = await db.select().from(schema.planItems).where(eq(schema.planItems.id, input.itemId));
  if (!item || item.purchasedAt) return { skipped: "already bought" };
  if (item.kind === "service") return { skipped: "services aren't watched" };
  const [recent] = await db
    .select({ id: schema.approvals.id })
    .from(schema.approvals)
    .where(
      and(
        eq(schema.approvals.kind, "watch"),
        sql`${schema.approvals.payload}->'watch'->>'itemId' = ${input.itemId}`,
        sql`${schema.approvals.createdAt} > now() - interval '24 hours'`,
      ),
    )
    .limit(1);
  if (recent) return { skipped: "already alerted in the last 24 hours" };

  const [offer] = item.chosenOfferId ? await db.select().from(schema.offers).where(eq(schema.offers.id, item.chosenOfferId)) : [];
  const merchant = offer?.merchant ?? "the store";
  const now = round(input.now);
  const user = await getDemoUser();
  const payload: ApprovalPayload = {
    goalId: item.goalId,
    orders: [{ itemId: item.id, name: item.name, merchant, qty: item.qty, unit: now }],
    orderTotal: round(now * item.qty),
    subscriptions: [],
    subscriptionMonthly: 0,
    invoices: [],
    shipTo: user.shipTo ?? undefined,
    watch: { itemId: item.id, was: round(input.was), now, target: round(input.target) },
  };
  const token = randomBytes(24).toString("base64url");
  const [approval] = await db
    .insert(schema.approvals)
    .values({
      userId: user.id,
      kind: "watch",
      amount: String(payload.orderTotal),
      title: `Price drop: ${item.name}`,
      payload,
      token: hash(token),
      expiresAt: new Date(Date.now() + WATCH_LINK_TTL_MS),
      step: "order",
    })
    .returning();

  const link = `${origin}/approve/${token}`;
  const saved = input.was - now;
  const line = `• ${item.name} (${merchant}): *${money(now)}*${saved > 0 ? `, was ${money(input.was)}` : ""}, target ${money(input.target)}\n  ${link}`;
  return { approvalId: approval.id, link, line };
}

/** Mark approvals as sent once their digest went out on WhatsApp. */
export async function markApprovalsSent(ids: string[], messageSid: string | null) {
  if (!ids.length) return;
  const db = await getDb();
  await db
    .update(schema.approvals)
    .set({ status: messageSid ? "sent" : "pending", whatsappMessageId: messageSid, updatedAt: new Date() })
    .where(inArray(schema.approvals.id, ids));
}

// ---------------------------------------------------------------------------------------------------
// Lookup

export async function getApprovalByToken(token: string): Promise<Approval | null> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const db = await getDb();
  const [a] = await db.select().from(schema.approvals).where(eq(schema.approvals.token, hash(token)));
  if (!a) return null;
  if ((a.status === "pending" || a.status === "sent") && a.expiresAt.getTime() < Date.now()) {
    const [e] = await db.update(schema.approvals).set({ status: "expired", updatedAt: new Date() }).where(eq(schema.approvals.id, a.id)).returning();
    return e;
  }
  return a;
}

export async function latestApprovalForGoal(goalId: string) {
  const db = await getDb();
  const rows = await db
    .select()
    .from(schema.approvals)
    .where(sql`${schema.approvals.payload}->>'goalId' = ${goalId}`)
    .orderBy(sql`${schema.approvals.createdAt} desc`)
    .limit(1);
  return rows[0] ?? null;
}

const isOpen = (a: Approval) => ["pending", "sent", "approved"].includes(a.status) && a.expiresAt.getTime() > Date.now();

/** Atomically move from one step to another; returns null if someone else already did. */
async function claimStep(id: string, from: string, to: string, extra: Partial<Approval> = {}) {
  const db = await getDb();
  const [row] = await db
    .update(schema.approvals)
    .set({ ...extra, step: to, updatedAt: new Date() })
    .where(and(eq(schema.approvals.id, id), eq(schema.approvals.step, from)))
    .returning();
  return row ?? null;
}

// ---------------------------------------------------------------------------------------------------
// Payment flow

const urls = (origin: string, token: string) => ({
  page: `${origin}/approve/${token}`,
  ret: (step: string) => `${origin}/approve/${token}/return?step=${step}`,
  cancel: `${origin}/approve/${token}?cancelled=1`,
});

/** "Continue with PayPal": returns where to send the browser next. */
export async function startPayment(token: string, origin: string): Promise<{ redirect: string } | { error: string }> {
  const a = await getApprovalByToken(token);
  if (!a) return { error: "This link isn't valid." };
  if (a.status === "paid") return { redirect: urls(origin, token).page };
  if (!isOpen(a)) return { error: "This link has expired. Ask LifeCart to send a new one from the checkout page." };
  const u = urls(origin, token);
  const p = a.payload;
  const db = await getDb();
  const extend = { expiresAt: new Date(Date.now() + LINK_TTL_MS), error: null };

  try {
    if (a.step === "order") {
      // Never start a second order if the last one was already approved or paid at PayPal.
      if (a.paypalOrderId) {
        const existing = await getOrder(a.paypalOrderId).catch(() => null);
        if (existing && (existing.status === "APPROVED" || existing.status === "COMPLETED")) {
          return { redirect: await settleOrder(a, token, origin) };
        }
      }
      const o = await createOrder({
        lines: p.orders.map((l) => ({ name: `${l.name} (${l.merchant})`, qty: l.qty, unit: l.unit })),
        returnUrl: u.ret("order"),
        cancelUrl: u.cancel,
        note: `LifeCart: ${a.title}`,
      });
      await db.update(schema.approvals).set({ ...extend, paypalOrderId: o.id, updatedAt: new Date() }).where(eq(schema.approvals.id, a.id));
      return { redirect: o.approveUrl };
    }
    if (a.step === "subscription") {
      const s = await createMonthlySubscription({
        name: `LifeCart refills: ${p.subscriptions.map((l) => l.name).join(", ")}`,
        monthly: p.subscriptionMonthly,
        returnUrl: u.ret("subscription"),
        cancelUrl: u.cancel,
      });
      await db.update(schema.approvals).set({ ...extend, paypalSubscriptionId: s.id, updatedAt: new Date() }).where(eq(schema.approvals.id, a.id));
      return { redirect: s.approveUrl };
    }
    if (a.step === "invoices") {
      await finalize(a.id);
      return { redirect: u.page };
    }
    return { redirect: u.page };
  } catch (e) {
    await db.update(schema.approvals).set({ error: describe(e), updatedAt: new Date() }).where(eq(schema.approvals.id, a.id));
    return { error: "PayPal couldn't start the payment. Please try again." };
  }
}

/** PayPal sends the buyer back here after approving (or we land here from the order step). */
export async function handleReturn(token: string, step: string, q: URLSearchParams, origin: string): Promise<string> {
  const a = await getApprovalByToken(token);
  const u = urls(origin, token);
  if (!a || a.status === "paid") return u.page;
  const db = await getDb();
  const fail = async (msg: string, backTo: string) => {
    await db.update(schema.approvals).set({ step: backTo, error: msg, updatedAt: new Date() }).where(eq(schema.approvals.id, a.id));
    return `${u.page}?error=1`;
  };

  if (step === "order" && a.step === "order") {
    // PayPal returns ?token=<orderId>. It must be the order we created for this approval.
    if (!a.paypalOrderId || q.get("token") !== a.paypalOrderId) return fail("PayPal returned an unexpected order.", "order");
    return settleOrder(a, token, origin);
  }

  if (step === "subscription" && a.step === "subscription") {
    const subId = q.get("subscription_id");
    if (!a.paypalSubscriptionId || subId !== a.paypalSubscriptionId) return fail("PayPal returned an unexpected subscription.", "subscription");
    const claimed = await claimStep(a.id, "subscription", "confirming");
    if (!claimed) return u.page;
    try {
      const s = await getSubscription(subId);
      if (!["ACTIVE", "APPROVED"].includes(s.status)) return fail(`Subscription status ${s.status}`, "subscription");
      await claimStep(a.id, "confirming", a.payload.invoices.length ? "invoices" : "done", {
        status: "approved",
        payerEmail: a.payerEmail ?? s.subscriber?.email_address ?? null,
        result: { ...(a.result ?? {}), subscriptionStatus: s.status },
      });
      await db.insert(schema.payments).values({ approvalId: a.id, rail: "subscription", paypalId: subId, amount: String(a.payload.subscriptionMonthly), status: s.status.toLowerCase() });
      await finalize(a.id);
      return u.page;
    } catch (e) {
      return fail(describe(e), "subscription");
    }
  }
  return u.page;
}

/**
 * Make sure the approval's PayPal order is captured exactly once, verified against PayPal itself, then move on.
 * Safe to call again: an order that's already COMPLETED is never captured twice.
 */
async function settleOrder(a: Approval, token: string, origin: string): Promise<string> {
  const u = urls(origin, token);
  const db = await getDb();
  const claimed = await claimStep(a.id, "order", "capturing");
  if (!claimed) return u.page; // a parallel request is already settling this order
  const back = async (msg: string, step = "order") => {
    await db.update(schema.approvals).set({ step, error: msg, updatedAt: new Date() }).where(eq(schema.approvals.id, a.id));
    return `${u.page}?error=1`;
  };
  try {
    const id = a.paypalOrderId!;
    let o = await getOrder(id);
    if (o.status === "APPROVED") {
      await captureOrder(id);
      o = await getOrder(id); // source of truth, whatever the capture response looked like
    }
    if (o.status !== "COMPLETED") return back(`Order ${id} is ${o.status}`);
    const { total, captureId } = capturedTotal(o);
    if (Math.abs(total - a.payload.orderTotal) > 0.01) {
      // Money moved but not the amount we approved: stop here (no retry button) and leave it for review/refund.
      return back(`Capture mismatch on ${id}: captured ${total}, expected ${a.payload.orderTotal}`, "review");
    }
    const next = a.payload.subscriptions.length ? "subscription" : a.payload.invoices.length ? "invoices" : "done";
    const result: ApprovalResult = { ...(a.result ?? {}), captureId, capturedAmount: total };
    await claimStep(a.id, "capturing", next, { status: "approved", payerEmail: o.payer?.email_address ?? null, result, error: null });
    await db.insert(schema.payments).values({ approvalId: a.id, rail: "order", paypalId: id, amount: String(total), status: "captured" });
    if (next === "subscription") {
      const fresh = await getApprovalByToken(token);
      const s = fresh ? await startPayment(token, origin) : { error: "missing" };
      return "redirect" in s ? s.redirect : `${u.page}?error=1`;
    }
    await finalize(a.id);
    return u.page;
  } catch (e) {
    return back(describe(e));
  }
}

/** Send service invoices (if any), mark paid, send the WhatsApp receipt. Idempotent. */
export async function finalize(approvalId: string) {
  const db = await getDb();
  const [a] = await db.select().from(schema.approvals).where(eq(schema.approvals.id, approvalId));
  if (!a || a.status === "paid") return;
  const result: ApprovalResult = { ...(a.result ?? {}), notes: [...(a.result?.notes ?? [])] };

  if (a.step === "invoices") {
    const claimed = await claimStep(a.id, "invoices", "invoicing");
    if (!claimed) return;
    const invoices: NonNullable<ApprovalResult["invoices"]> = [];
    if (!a.payerEmail) {
      result.notes!.push("Service invoices weren't sent because we don't have your PayPal email yet.");
    } else {
      for (const l of a.payload.invoices) {
        try {
          const inv = await createAndSendInvoice({
            provider: `${l.merchant} (via LifeCart)`,
            email: a.payerEmail,
            lines: [{ name: l.cadence === "monthly" ? `${l.name}, first month` : l.name, amount: l.unit * l.qty }],
            note: l.cadence === "monthly" ? "Monthly service. LifeCart will send next month's invoice for your approval." : undefined,
          });
          invoices.push({ id: inv.id, name: l.name, amount: l.unit * l.qty, url: inv.url, status: inv.status });
          await db.insert(schema.payments).values({ approvalId: a.id, rail: "invoice", paypalId: inv.id, amount: String(l.unit * l.qty), status: "sent" });
        } catch (e) {
          const permission = e instanceof PayPalError && e.status === 403;
          result.notes!.push(
            permission
              ? `Couldn't send the invoice for ${l.name}: the PayPal app needs the Invoicing feature enabled.`
              : `Couldn't send the invoice for ${l.name}. You can resend it later.`,
          );
        }
      }
    }
    result.invoices = invoices;
  }

  const [done] = await db
    .update(schema.approvals)
    .set({ status: "paid", step: "done", result, updatedAt: new Date() })
    .where(and(eq(schema.approvals.id, a.id), inArray(schema.approvals.status, ["pending", "sent", "approved"])))
    .returning();
  if (!done) return;

  // Mark everything paid for as bought so it can never be charged again.
  const p = a.payload;
  const paidIds = [...p.orders, ...p.subscriptions, ...p.invoices].map((l) => l.itemId);
  if (paidIds.length) await db.update(schema.planItems).set({ purchasedAt: new Date() }).where(inArray(schema.planItems.id, paidIds));
  if (p.watch) {
    // Bought through a price-drop alert: it's no longer watched, and the offer shows the price actually paid.
    const [item] = await db
      .update(schema.planItems)
      .set({ payType: "order", priority: "now", targetPrice: null })
      .where(eq(schema.planItems.id, p.watch.itemId))
      .returning();
    if (item?.chosenOfferId)
      await db
        .update(schema.offers)
        .set({ price: String(p.watch.now), wasPrice: String(p.watch.was) })
        .where(eq(schema.offers.id, item.chosenOfferId));
  }

  const lines = [
    p.watch ? `*LifeCart*: bought at the lower price ✅ (saved ${money(Math.max(0, p.watch.was - p.watch.now))})` : "*LifeCart*: paid ✅",
    p.orders.length ? `Order: ${money(result.capturedAmount ?? p.orderTotal)} captured with PayPal` : null,
    p.subscriptions.length ? `Refills: ${money(p.subscriptionMonthly)}/mo subscription ${result.subscriptionStatus ? "active" : "set up"}` : null,
    result.invoices?.length ? `${result.invoices.length} service invoice${result.invoices.length > 1 ? "s" : ""} sent to your PayPal email` : null,
    "We'll message you tracking numbers when the stores ship.",
  ].filter(Boolean);
  await sendWhatsApp(lines.join("\n"));
}

function describe(e: unknown) {
  if (e instanceof PayPalError) return `${e.message}${e.status ? ` (${e.status})` : ""}`;
  return e instanceof Error ? e.message : String(e);
}
