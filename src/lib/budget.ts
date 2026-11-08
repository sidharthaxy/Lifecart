import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { num } from "./format";

/**
 * Monthly shopping budget: what you've spent since your budget month started, and what's left.
 * Counts shopping only (bills are separate):
 *  - one-time PayPal captures from plan checkouts and price-drop buys made this budget month
 *  - monthly refills that are still active (they're charged every month)
 *  - service invoices marked paid this budget month
 */

export type BudgetStatus = {
  budget: number | null;
  spent: number;
  left: number | null;
  resetDay: number;
  /** ISO dates: first day of this budget month, and the day it starts fresh again. */
  start: string;
  next: string;
  parts: { label: string; amount: number }[];
};

const round = (n: number) => Math.round(n * 100) / 100;

export function ordinal(n: number) {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${s}`;
}

/** The budget month containing `now`, for a reset day of 1-28. */
export function budgetCycle(resetDay: number, now = new Date()) {
  const d = Math.min(Math.max(Math.round(resetDay) || 1, 1), 28);
  const y = now.getFullYear();
  const m = now.getMonth();
  const start = now.getDate() >= d ? new Date(y, m, d) : new Date(y, m - 1, d);
  const next = new Date(start.getFullYear(), start.getMonth() + 1, d);
  return { start, next, day: d };
}

export async function budgetStatus(user: { id: string; monthlyBudget: string | null; budgetDay: number }): Promise<BudgetStatus> {
  const { start, next, day } = budgetCycle(user.budgetDay);
  const db = await getDb();

  const captures = await db
    .select({ result: schema.approvals.result })
    .from(schema.approvals)
    .where(
      and(
        eq(schema.approvals.userId, user.id),
        inArray(schema.approvals.kind, ["cart", "watch"]),
        sql`${schema.approvals.result}->>'captureId' is not null`,
        gte(schema.approvals.updatedAt, start),
      ),
    );
  const oneTime = captures.reduce((a, c) => a + (c.result?.capturedAmount ?? 0), 0);

  const recurring = await db
    .select({ rail: schema.payments.rail, amount: schema.payments.amount, status: schema.payments.status, createdAt: schema.payments.createdAt })
    .from(schema.payments)
    .innerJoin(schema.approvals, eq(schema.approvals.id, schema.payments.approvalId))
    .where(and(eq(schema.approvals.userId, user.id), inArray(schema.payments.rail, ["subscription", "invoice"])));
  const refills = recurring
    .filter((p) => p.rail === "subscription" && !["cancelled", "canceled", "expired", "suspended"].includes(p.status.toLowerCase()))
    .reduce((a, p) => a + (num(p.amount) ?? 0), 0);
  const services = recurring
    .filter((p) => p.rail === "invoice" && p.status.toLowerCase() === "paid" && p.createdAt >= start)
    .reduce((a, p) => a + (num(p.amount) ?? 0), 0);

  const spent = round(oneTime + refills + services);
  const budget = num(user.monthlyBudget);
  return {
    budget,
    spent,
    left: budget != null ? round(budget - spent) : null,
    resetDay: day,
    start: start.toISOString(),
    next: next.toISOString(),
    parts: [
      { label: "Purchases", amount: round(oneTime) },
      { label: "Monthly refills", amount: round(refills) },
      { label: "Services", amount: round(services) },
    ].filter((p) => p.amount > 0),
  };
}
