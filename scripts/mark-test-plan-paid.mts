// Dev tool (test accounts only): mark every item of an @example.com account's plans as bought, except one product
// left on price watch, to preview the "All paid" screen. STOP `npm run dev` first.
// Usage: npx tsx --env-file=.env.local scripts/mark-test-plan-paid.mts coupons.test@example.com
import { eq, inArray } from "drizzle-orm";
import { getDb, schema } from "../src/db";

const email = process.argv[2] ?? "";
if (!/@example\.com$/.test(email)) throw new Error("test accounts (@example.com) only");
const db = await getDb();
const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email));
if (!user) throw new Error("no such account");
const goals = await db.select().from(schema.goals).where(eq(schema.goals.userId, user.id));
const items = goals.length ? await db.select().from(schema.planItems).where(inArray(schema.planItems.goalId, goals.map((g) => g.id))) : [];
const watch = items.find((i) => i.kind === "product");
for (const i of items) {
  if (i.id === watch?.id) await db.update(schema.planItems).set({ payType: "watch", purchasedAt: null, targetPrice: String(Math.round(Number(i.estimatedPrice ?? 20) * 80) / 100) }).where(eq(schema.planItems.id, i.id));
  else await db.update(schema.planItems).set({ purchasedAt: new Date() }).where(eq(schema.planItems.id, i.id));
}
console.log(`${goals.length} plan(s): ${items.length - 1} item(s) marked bought, 1 left on price watch`);
process.exit(0);
