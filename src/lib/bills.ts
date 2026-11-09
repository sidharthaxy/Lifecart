import { and, asc, eq, isNull, lt, or, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { createBillApproval, isPaidNow } from "./approvals";
import { money, num } from "./format";
import { periodLabel } from "./bill-period";
import type { SendResult } from "./whatsapp";

/**
 * Bills hub. Payments are real PayPal (sandbox) payments through the same verified approval flow as plans.
 * In this build they are paid to LifeCart's PayPal account; forwarding to the biller (e.g. PayPal Payouts) isn't connected.
 */

export type Bill = typeof schema.bills.$inferSelect;
export type BillView = {
  id: string;
  type: string;
  name: string;
  payee: string;
  accountLabel: string | null;
  amount: number;
  average: number | null;
  dueDate: string;
  /** Start of the current billing period (null = monthly, from before periods existed). */
  periodStart: string | null;
  /** e.g. "1 month", "2 weeks". */
  periodLabel: string;
  daysLeft: number;
  paid: boolean;
  paidAt: string | null;
  autopayMode: string;
  planOptions: { price: number; label: string }[] | null;
  usageNote: string | null;
};
export type Insight = { billId: string; tone: "warn" | "save"; title: string; body: string; action?: { label: string; price: number } };

const DAY = 86_400_000;
const inDays = (n: number) => {
  const d = new Date(Date.now() + n * DAY);
  d.setHours(12, 0, 0, 0);
  return d;
};

/** Demo tools only: a realistic set of sample US household bills. */
export async function addSampleBills(userId: string) {
  const db = await getDb();
  const [has] = await db.select({ id: schema.bills.id }).from(schema.bills).where(and(eq(schema.bills.userId, userId), sql`${schema.bills.payee} like '%(sample%'`)).limit(1);
  if (has) return { added: 0 };
  await db.insert(schema.bills).values([
    { userId, type: "phone", name: "Phone top-up", payee: "Prepaid Wireless (sample)", accountLabel: "Unlimited plan · (415) ···0142", amount: "30", averageAmount: "30", dueDate: inDays(2), autopayMode: "ask", planOptions: [{ price: 20, label: "5 GB" }, { price: 30, label: "Unlimited" }, { price: 45, label: "Unlimited+" }], usageNote: "3 GB" },
    { userId, type: "electricity", name: "Electricity", payee: "City Power & Light (sample)", accountLabel: "Account ···4471", amount: "96.40", averageAmount: "73.50", dueDate: inDays(5), autopayMode: "ask" },
    { userId, type: "internet", name: "Internet", payee: "FiberNet (sample)", accountLabel: "500 Mbps · account ···8820", amount: "65", averageAmount: "65", dueDate: inDays(9), autopayMode: "autopay_notify" },
    { userId, type: "subscription", name: "Streaming", payee: "StreamBox (sample)", accountLabel: "Standard plan", amount: "15.49", averageAmount: "15.49", dueDate: inDays(11), autopayMode: "autopay_notify" },
    { userId, type: "water", name: "Water", payee: "Metro Water District (sample)", accountLabel: "Account ···2093", amount: "42.10", averageAmount: "40.80", dueDate: inDays(16), autopayMode: "ask" },
    { userId, type: "rent", name: "Rent", payee: "Maple Court Apartments (sample landlord)", accountLabel: "Apt 4B", amount: "1850", averageAmount: "1850", dueDate: inDays(20), autopayMode: "remind" },
  ]);
  return { added: 6 };
}

export async function listBills(userId: string): Promise<BillView[]> {
  const db = await getDb();
  const rows = await db.select().from(schema.bills).where(eq(schema.bills.userId, userId)).orderBy(asc(schema.bills.dueDate));
  return rows.map((b) => ({
    id: b.id,
    type: b.type,
    name: b.name,
    payee: b.payee,
    accountLabel: b.accountLabel,
    amount: num(b.amount) ?? 0,
    average: num(b.averageAmount),
    dueDate: b.dueDate.toISOString(),
    periodStart: b.periodStart?.toISOString() ?? null,
    periodLabel: periodLabel(b.periodStart, b.dueDate),
    daysLeft: Math.ceil((b.dueDate.getTime() - Date.now()) / DAY),
    paid: isPaidNow(b),
    paidAt: b.paidAt?.toISOString() ?? null,
    autopayMode: b.autopayMode,
    planOptions: b.planOptions,
    usageNote: b.usageNote,
  }));
}

/** Deterministic, explainable insights (no model guesswork about the user's money). */
export function insights(bills: BillView[]): Insight[] {
  const out: Insight[] = [];
  for (const b of bills) {
    if (b.average && b.amount > b.average * 1.15) {
      const pct = Math.round((b.amount / b.average - 1) * 100);
      out.push({ billId: b.id, tone: "warn", title: `${b.name} is up ${pct}%`, body: `${money(b.amount)} this month against a 3-month average of ${money(b.average)}.` });
    }
    const usage = Number.parseFloat(b.usageNote ?? "");
    if (b.planOptions?.length && Number.isFinite(usage)) {
      const fits = b.planOptions
        .filter((o) => o.price < b.amount)
        .filter((o) => /unlimited/i.test(o.label) || Number.parseFloat(o.label) >= usage * 1.25)
        .sort((a, c) => a.price - c.price)[0];
      if (fits) {
        out.push({
          billId: b.id,
          tone: "save",
          title: "Your phone plan is bigger than you need",
          body: `You've used about ${b.usageNote} a month. The ${money(fits.price)} plan (${fits.label}) covers that and saves ${money((b.amount - fits.price) * 12)} a year.`,
          action: { label: `Switch to ${money(fits.price)}`, price: fits.price },
        });
      }
    }
  }
  return out;
}

export async function changePhonePlan(billId: string, price: number, userId: string) {
  const db = await getDb();
  const [b] = await db.select().from(schema.bills).where(and(eq(schema.bills.id, billId), eq(schema.bills.userId, userId)));
  const opt = b?.planOptions?.find((o) => o.price === price);
  if (!b || !opt) return { error: "Unknown plan" };
  await db
    .update(schema.bills)
    .set({ amount: String(opt.price), averageAmount: String(opt.price), accountLabel: `${opt.label} plan` })
    .where(eq(schema.bills.id, billId));
  return { ok: true };
}

export type BillInput = { name: string; payee: string; type: string; amount: number; periodStart: Date; dueDate: Date };
const BILL_TYPES = ["rent", "electricity", "water", "internet", "phone", "subscription", "other"];
const billType = (t: string) => (BILL_TYPES.includes(t) ? t : "other") as Bill["type"];

export async function addBill(userId: string, input: BillInput) {
  const db = await getDb();
  await db.insert(schema.bills).values({
    userId,
    type: billType(input.type),
    name: input.name,
    payee: input.payee,
    amount: String(input.amount),
    averageAmount: String(input.amount),
    periodStart: input.periodStart,
    dueDate: input.dueDate,
  });
}

/**
 * Edit a bill: name, payee, type, amount and the current period. Changing the dates re-opens the bill if the
 * new period has already started (it becomes due again), and clears the reminder cooldown so a near due date
 * still gets its reminder.
 */
export async function updateBill(userId: string, billId: string, input: BillInput): Promise<{ ok: true } | { error: string }> {
  const db = await getDb();
  const [b] = await db.select().from(schema.bills).where(and(eq(schema.bills.id, billId), eq(schema.bills.userId, userId)));
  if (!b) return { error: "Bill not found." };
  const datesChanged = b.dueDate.getTime() !== input.dueDate.getTime() || (b.periodStart?.getTime() ?? 0) !== input.periodStart.getTime();
  await db
    .update(schema.bills)
    .set({
      name: input.name,
      payee: input.payee,
      type: billType(input.type),
      amount: String(input.amount),
      periodStart: input.periodStart,
      dueDate: input.dueDate,
      ...(datesChanged ? { lastRemindedAt: null } : {}),
    })
    .where(eq(schema.bills.id, billId));
  return { ok: true };
}

/**
 * Due-date reminders: bills unpaid and due within 3 days (or overdue), not reminded in the last 24h.
 * Sends ONE WhatsApp digest with ONE PayPal link covering all of them. Returns what it did.
 */
export async function remindDueBills(origin: string, userId: string): Promise<{ count: number; whatsapp: SendResult | null; link?: string }> {
  const db = await getDb();
  const soon = new Date(Date.now() + 3 * DAY);
  const cooldown = new Date(Date.now() - DAY);
  const rows = (
    await db
      .select()
      .from(schema.bills)
      .where(
        and(
          eq(schema.bills.userId, userId),
          lt(schema.bills.dueDate, soon),
          or(isNull(schema.bills.lastRemindedAt), lt(schema.bills.lastRemindedAt, cooldown)),
        ),
      )
      .orderBy(asc(schema.bills.dueDate))
  ).filter((b) => !isPaidNow(b) && b.autopayMode !== "autopay_notify");
  if (!rows.length) return { count: 0, whatsapp: null };

  const total = rows.reduce((a, b) => a + Number(b.amount), 0);
  const day = (d: Date) => d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const res = await createBillApproval(
    userId,
    rows.map((b) => b.id),
    origin,
    {
      notify: true,
      message: (link) =>
        [
          `*LifeCart*: ${rows.length === 1 ? "a bill is" : `${rows.length} bills are`} due soon`,
          "",
          ...rows.map((b) => `• ${b.name} (${b.payee.replace(/ \(sample.*\)$/, "")}): *${money(Number(b.amount))}*, due ${day(b.dueDate)}`),
          "",
          `Total ${money(total)}. Pay with PayPal (link valid 6 hours):`,
          link,
        ].join("\n"),
    },
  );
  if ("error" in res) return { count: 0, whatsapp: null };
  await db
    .update(schema.bills)
    .set({ lastRemindedAt: new Date() })
    .where(or(...rows.map((b) => eq(schema.bills.id, b.id))));
  return { count: rows.length, whatsapp: res.whatsapp, link: res.link };
}

/** Delete a bill. Reminders stop; payments already made stay on the Money page. */
export async function deleteBill(billId: string, userId: string): Promise<{ ok: true } | { error: string }> {
  const db = await getDb();
  const gone = await db.delete(schema.bills).where(and(eq(schema.bills.id, billId), eq(schema.bills.userId, userId))).returning();
  if (!gone.length) return { error: "Bill not found." };
  // Retire unpaid payment links that include this bill.
  await db
    .update(schema.approvals)
    .set({ status: "expired", updatedAt: new Date() })
    .where(and(eq(schema.approvals.userId, userId), eq(schema.approvals.kind, "bill"), sql`${schema.approvals.payload}->'bills'->'ids' ? ${billId}`, sql`${schema.approvals.status} in ('pending','sent')`));
  return { ok: true };
}
