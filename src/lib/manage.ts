import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { num } from "./format";
import { cancelSubscription, getInvoiceStatus, getSubscription } from "./paypal";

/**
 * After payment: the refills subscriptions and service invoices LifeCart created, with live status from PayPal
 * (through the Agent Toolkit). Lookups are capped per page view and failures fall back to the stored status.
 */
const MAX_LIVE_LOOKUPS = 8;

export type ManagedItem = {
  paymentId: string;
  rail: "subscription" | "invoice";
  paypalId: string;
  title: string;
  lines: string[];
  amount: number;
  status: string;
  url?: string;
  createdAt: Date;
};

export async function listManaged(userId: string): Promise<ManagedItem[]> {
  const db = await getDb();
  const rows = await db
    .select({ p: schema.payments, a: schema.approvals })
    .from(schema.payments)
    .innerJoin(schema.approvals, eq(schema.approvals.id, schema.payments.approvalId))
    .where(and(eq(schema.approvals.userId, userId), inArray(schema.payments.rail, ["subscription", "invoice"])))
    .orderBy(desc(schema.payments.createdAt))
    .limit(30);

  let lookups = 0;
  const out: ManagedItem[] = [];
  for (const { p, a } of rows) {
    if (!p.paypalId) continue;
    let status = p.status;
    let url: string | undefined = a.result?.invoices?.find((i) => i.id === p.paypalId)?.url;
    const final = ["cancelled", "canceled", "paid", "expired"].includes(status.toLowerCase());
    if (!final && lookups < MAX_LIVE_LOOKUPS) {
      lookups++;
      try {
        if (p.rail === "subscription") status = (await getSubscription(p.paypalId)).status.toLowerCase();
        else {
          const inv = await getInvoiceStatus(p.paypalId);
          status = inv.status.toLowerCase();
          url = inv.url ?? url;
        }
        if (status !== p.status) await db.update(schema.payments).set({ status }).where(eq(schema.payments.id, p.id));
      } catch {
        // keep the stored status
      }
    }
    const lines =
      p.rail === "subscription"
        ? a.payload.subscriptions.map((l) => l.name)
        : [a.result?.invoices?.find((i) => i.id === p.paypalId)?.name ?? "Service invoice"];
    out.push({ paymentId: p.id, rail: p.rail as "subscription" | "invoice", paypalId: p.paypalId, title: a.title, lines, amount: num(p.amount) ?? 0, status, url, createdAt: p.createdAt });
  }
  return out;
}

/** Cancel a refills subscription (toolkit cancel_subscription), then record PayPal's resulting status. */
export async function cancelRefills(paymentId: string, userId: string): Promise<{ status: string } | { error: string }> {
  const db = await getDb();
  const [row] = await db
    .select({ p: schema.payments })
    .from(schema.payments)
    .innerJoin(schema.approvals, eq(schema.approvals.id, schema.payments.approvalId))
    .where(and(eq(schema.payments.id, paymentId), eq(schema.payments.rail, "subscription"), eq(schema.approvals.userId, userId)));
  const p = row?.p;
  if (!p?.paypalId) return { error: "Subscription not found." };
  if (["cancelled", "canceled"].includes(p.status.toLowerCase())) return { status: "cancelled" };
  try {
    const s = await cancelSubscription(p.paypalId);
    const status = s.status.toLowerCase();
    await db.update(schema.payments).set({ status }).where(eq(schema.payments.id, p.id));
    return { status };
  } catch {
    return { error: "PayPal couldn't cancel it right now. Please try again." };
  }
}
