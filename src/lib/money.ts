import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { listBills } from "./bills";
import { num } from "./format";
import { getCapture, getInvoiceStatus, getSubscriptionBilling } from "./paypal";

/**
 * Money ledger: everything LifeCart moved through PayPal, reconciled against PayPal itself.
 *  - every capture LifeCart made -> live capture status (COMPLETED / REFUNDED / PARTIALLY_REFUNDED) + amount check
 *  - refills subscriptions -> PayPal's own last-payment record (what was actually charged)
 *  - service invoices -> live invoice status (counted once PAID)
 * Per user: cached for 5 minutes, PayPal lookups capped per refresh. (The merchant-wide transaction report is NOT
 * shown here: it would include other customers' payments.)
 */

export type LedgerRow = {
  id: string;
  date: string;
  title: string;
  detail: string;
  source: "Plan" | "Bill" | "Price drop" | "Refills" | "Service";
  status: string;
  amount: number;
  /** What counts toward spend after refunds (e.g. 0 for a refunded capture, or an unpaid invoice). */
  counted: number;
  refunded: number;
  saved: number;
  paypalId: string | null;
  verified: "Verified with PayPal" | "Amount mismatch" | "Not checked";
};

export type CalendarEvent = { id: string; name: string; startDate: string; endDate: string; resourceId: "bills" | "renewals" | "payments" | "refunds"; allDay: true };

export type MoneyView = {
  rows: LedgerRow[];
  totals: { spent: number; saved: number; refunded: number; recurring: number; refillsMonthly: number; billsMonthly: number };
  bySource: { source: string; amount: number }[];
  events: CalendarEvent[];
  checkedAt: string;
  paypalLookups: number;
};

const MAX_LOOKUPS = 30;
const TTL_MS = 5 * 60_000;
const cache = new Map<string, { at: number; value: MoneyView }>();
export const clearMoneyCache = (userId: string) => {
  cache.delete(userId);
};

const round = (n: number) => Math.round(n * 100) / 100;
const day = (d: Date | string) => new Date(d).toISOString().slice(0, 10);

export async function getMoney(userId: string): Promise<MoneyView> {
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const db = await getDb();
  let lookups = 0;
  const can = () => lookups < MAX_LOOKUPS;
  const rows: LedgerRow[] = [];
  const events: CalendarEvent[] = [];

  // 1. Captures LifeCart made (plan checkouts, bills, price-drop buys)
  const captured = await db
    .select()
    .from(schema.approvals)
    .where(and(eq(schema.approvals.userId, userId), or(eq(schema.approvals.status, "paid"), sql`${schema.approvals.result}->>'captureId' is not null`)))
    .orderBy(desc(schema.approvals.updatedAt));
  await mapLimit(captured, 6, async (a) => {
    const capId = a.result?.captureId;
    if (!capId) return;
    const amount = a.result?.capturedAmount ?? Number(a.amount);
    let status = "Completed";
    let verified: LedgerRow["verified"] = "Not checked";
    let refunded = 0;
    if (can()) {
      lookups++;
      try {
        const c = await getCapture(capId);
        status = c.status === "COMPLETED" ? "Completed" : c.status === "REFUNDED" ? "Refunded" : c.status === "PARTIALLY_REFUNDED" ? "Partly refunded" : c.status;
        verified = Math.abs(c.amount - amount) < 0.01 ? "Verified with PayPal" : "Amount mismatch";
        if (c.status === "REFUNDED") refunded = amount;
      } catch {
        // keep "Not checked"
      }
    }
    const p = a.payload;
    // Savings: below-list on bought plan items; price drop vs the price when watched.
    let saved = 0;
    if (p.watch) saved = Math.max(0, p.watch.was - p.watch.now);
    else if (!p.bills && p.orders.length) {
      const ids = p.orders.map((l) => l.itemId);
      const items = await db
        .select({ qty: schema.planItems.qty, price: schema.offers.price, was: schema.offers.wasPrice })
        .from(schema.planItems)
        .innerJoin(schema.offers, eq(schema.offers.id, schema.planItems.chosenOfferId))
        .where(inArray(schema.planItems.id, ids));
      saved = items.reduce((s, i) => s + Math.max(0, (num(i.was) ?? 0) - (num(i.price) ?? 0)) * i.qty, 0);
    }
    const source: LedgerRow["source"] = p.bills ? "Bill" : p.watch ? "Price drop" : "Plan";
    const when = a.updatedAt.toISOString();
    rows.push({
      id: a.id,
      date: when,
      title: a.title,
      detail: p.orders.map((l) => l.name).slice(0, 3).join(", ") + (p.orders.length > 3 ? ` +${p.orders.length - 3} more` : ""),
      source,
      status,
      amount,
      counted: round(amount - refunded),
      refunded,
      saved: refunded ? 0 : round(saved),
      paypalId: capId,
      verified,
    });
    events.push({
      id: `pay-${a.id}`,
      name: `${refunded ? "Refunded" : "Paid"} ${fmt(amount)} · ${a.title}`,
      startDate: day(when),
      endDate: day(when),
      resourceId: refunded ? "refunds" : "payments",
      allDay: true,
    });
  });

  // 2. Refills subscriptions and 3. service invoices
  const managed = await db
    .select({ p: schema.payments, a: schema.approvals })
    .from(schema.payments)
    .innerJoin(schema.approvals, eq(schema.approvals.id, schema.payments.approvalId))
    .where(and(eq(schema.approvals.userId, userId), inArray(schema.payments.rail, ["subscription", "invoice"])))
    .orderBy(desc(schema.payments.createdAt));
  await mapLimit(managed, 6, async ({ p, a }) => {
    if (!p.paypalId) return;
    const amount = num(p.amount) ?? 0;
    if (p.rail === "subscription") {
      let status = p.status;
      let charged = 0;
      let next: string | undefined;
      let verified: LedgerRow["verified"] = "Not checked";
      if (can()) {
        lookups++;
        try {
          const s = await getSubscriptionBilling(p.paypalId);
          status = s.status;
          charged = s.lastPayment;
          next = s.nextBillingAt;
          verified = "Verified with PayPal";
        } catch {
          // keep stored status
        }
      }
      const pretty = status.charAt(0) + status.slice(1).toLowerCase();
      rows.push({
        id: p.id,
        date: p.createdAt.toISOString(),
        title: `Refills · ${a.title}`,
        detail: a.payload.subscriptions.map((l) => l.name).join(", "),
        source: "Refills",
        status: pretty,
        amount,
        counted: round(charged),
        refunded: 0,
        saved: 0,
        paypalId: p.paypalId,
        verified,
      });
      if (next && status === "ACTIVE")
        events.push({ id: `renew-${p.id}`, name: `Refills renew ${fmt(amount)}`, startDate: day(next), endDate: day(next), resourceId: "renewals", allDay: true });
    } else {
      let status = p.status;
      if (can() && !["paid", "cancelled"].includes(status.toLowerCase())) {
        lookups++;
        try {
          status = (await getInvoiceStatus(p.paypalId)).status;
        } catch {
          // keep stored status
        }
      }
      const paid = status.toUpperCase() === "PAID";
      rows.push({
        id: p.id,
        date: p.createdAt.toISOString(),
        title: a.result?.invoices?.find((i) => i.id === p.paypalId)?.name ?? "Service invoice",
        detail: `Invoice · ${a.title}`,
        source: "Service",
        status: status.charAt(0) + status.slice(1).toLowerCase(),
        amount,
        counted: paid ? amount : 0,
        refunded: 0,
        saved: 0,
        paypalId: p.paypalId,
        verified: "Verified with PayPal",
      });
    }
  });

  // Bills: due dates on the calendar, monthly total in "recurring"
  const bills = await listBills(userId);
  for (const b of bills) {
    events.push({
      id: `bill-${b.id}`,
      name: `${b.name} ${fmt(b.amount)} due`,
      startDate: day(b.dueDate),
      endDate: day(b.dueDate),
      resourceId: "bills",
      allDay: true,
    });
  }

  rows.sort((x, y) => y.date.localeCompare(x.date));
  const spent = round(rows.reduce((s, r) => s + r.counted, 0));
  const refillsMonthly = round(rows.filter((r) => r.source === "Refills" && r.status.toUpperCase() === "ACTIVE").reduce((s, r) => s + r.amount, 0));
  const billsMonthly = round(bills.reduce((s, b) => s + b.amount, 0));
  const order: LedgerRow["source"][] = ["Plan", "Bill", "Price drop", "Refills", "Service"];
  const bySource = order
    .map((source) => ({ source, amount: round(rows.filter((r) => r.source === source).reduce((s, r) => s + r.counted, 0)) }))
    .filter((x) => x.amount > 0)
    .sort((x, y) => y.amount - x.amount);

  const value: MoneyView = {
    rows,
    totals: {
      spent,
      saved: round(rows.reduce((s, r) => s + r.saved, 0)),
      refunded: round(rows.reduce((s, r) => s + r.refunded, 0)),
      recurring: round(refillsMonthly + billsMonthly),
      refillsMonthly,
      billsMonthly,
    },
    bySource,
    events,
    checkedAt: new Date().toISOString(),
    paypalLookups: lookups,
  };
  cache.set(userId, { at: Date.now(), value });
  return value;
}

function fmt(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}


/** Run fn over items with at most `limit` in flight (keeps PayPal lookups fast but polite). */
async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await fn(items[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}
