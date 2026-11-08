// Dev tool: delete one plan (goal) and its items/offers/price history/watches (cascade). Payments and approvals
// are kept, so /money still shows what was paid. STOP `npm run dev` first (PGlite is single-process).
// Dry run by default:  npx tsx --env-file=.env.local scripts/delete-plan.mts <planId>
// Delete:              npx tsx --env-file=.env.local scripts/delete-plan.mts <planId> --apply
import { eq, sql } from "drizzle-orm";
import { getDb, schema } from "../src/db";

const [id] = process.argv.slice(2);
const apply = process.argv.includes("--apply");
if (!id || !/^[0-9a-f-]{36}$/.test(id)) throw new Error("usage: <planId> [--apply]");

const db = await getDb();
const [goal] = await db.select().from(schema.goals).where(eq(schema.goals.id, id));
if (!goal) {
  console.log("No plan with that id.");
  process.exit(0);
}
const items = await db.select({ id: schema.planItems.id }).from(schema.planItems).where(eq(schema.planItems.goalId, id));
const approvals = await db.select({ id: schema.approvals.id, status: schema.approvals.status }).from(schema.approvals).where(sql`${schema.approvals.payload}->>'goalId' = ${id}`);
console.log(`Plan: ${goal.title ?? "(untitled)"}\nPrompt: ${goal.prompt.slice(0, 90)}\nItems: ${items.length} (offers, price history and watches go with them)\nApprovals/payments kept: ${approvals.length} (${approvals.map((a) => a.status).join(", ")})`);
if (!apply) {
  console.log("\nDry run. Add --apply to delete.");
  process.exit(0);
}
await db.delete(schema.goals).where(eq(schema.goals.id, id));
const [left] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.planItems).where(eq(schema.planItems.goalId, id));
console.log(`\nDeleted. Items left for this plan: ${left.n}.`);
process.exit(0);
