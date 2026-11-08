// Dev tool: checks the monthly budget maths (cycle dates + what counts as spent) on a throwaway @example.com account.
// STOP `npm run dev` first (PGlite is single-process). Usage: npx tsx --env-file=.env.local scripts/budget-test.mts
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb, schema } from "../src/db";
import { budgetCycle, budgetStatus } from "../src/lib/budget";

const ok = (cond: boolean, what: string) => console.log(`${cond ? "PASS" : "FAIL"}  ${what}`);
const d = (x: Date) => x.toDateString();

// Cycle dates
const now = new Date(2026, 10, 8); // 8 Nov 2026
let c = budgetCycle(1, now);
ok(d(c.start) === d(new Date(2026, 10, 1)) && d(c.next) === d(new Date(2026, 11, 1)), "reset on the 1st: 1 Nov to 1 Dec");
c = budgetCycle(15, now);
ok(d(c.start) === d(new Date(2026, 9, 15)) && d(c.next) === d(new Date(2026, 10, 15)), "reset on the 15th, on 8 Nov: 15 Oct to 15 Nov");
c = budgetCycle(8, now);
ok(d(c.start) === d(new Date(2026, 10, 8)), "reset day = today: starts today");
c = budgetCycle(28, new Date(2026, 0, 5));
ok(d(c.start) === d(new Date(2025, 11, 28)), "across a year boundary: 28 Dec to 28 Jan");

// Spent: one capture this month, one older capture, an active refill, a cancelled refill
const db = await getDb();
const [u] = await db.insert(schema.users).values({ email: `budget.${Date.now().toString(36)}@example.com`, name: "Budget Test", monthlyBudget: "500", budgetDay: 1, onboardedAt: new Date() }).returning();
const tok = () => randomBytes(16).toString("hex");
const base = { userId: u.id, title: "t", token: "", expiresAt: new Date(), step: "done" as const };
const payload = { goalId: "", orders: [], orderTotal: 0, subscriptions: [], subscriptionMonthly: 0, invoices: [] };
const thisCycle = budgetCycle(1).start;
await db.insert(schema.approvals).values([
  { ...base, token: tok(), kind: "cart", amount: "120", status: "paid", payload, result: { captureId: "CAP1", capturedAmount: 120 }, updatedAt: new Date() },
  { ...base, token: tok(), kind: "watch", amount: "30", status: "paid", payload, result: { captureId: "CAP2", capturedAmount: 30 }, updatedAt: new Date() },
  { ...base, token: tok(), kind: "cart", amount: "999", status: "paid", payload, result: { captureId: "OLD", capturedAmount: 999 }, updatedAt: new Date(thisCycle.getTime() - 86_400_000) },
  { ...base, token: tok(), kind: "bill", amount: "65", status: "paid", payload, result: { captureId: "BILL", capturedAmount: 65 }, updatedAt: new Date() },
]);
const [subA] = await db.insert(schema.approvals).values({ ...base, token: tok(), kind: "cart", amount: "0", status: "paid", payload }).returning();
await db.insert(schema.payments).values([
  { approvalId: subA.id, rail: "subscription", paypalId: "I-ACTIVE", amount: "40", status: "active" },
  { approvalId: subA.id, rail: "subscription", paypalId: "I-CANCELLED", amount: "25", status: "cancelled" },
]);
const s = await budgetStatus(u);
console.log("status:", JSON.stringify({ spent: s.spent, left: s.left, parts: s.parts }));
ok(s.spent === 190, "spent = $120 checkout + $30 price-drop buy + $40 active refill (old capture, bill and cancelled refill ignored)");
ok(s.left === 310, "left = $500 - $190 = $310");

// clean up
await db.delete(schema.payments).where(eq(schema.payments.approvalId, subA.id));
await db.delete(schema.approvals).where(eq(schema.approvals.userId, u.id));
await db.delete(schema.users).where(eq(schema.users.id, u.id));
process.exit(0);
