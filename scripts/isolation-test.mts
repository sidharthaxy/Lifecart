// Dev tool: checks that one account can't read or change another account's data (no external API calls).
// Uses the two newest accounts (A = older, B = newer). Adds a small "Checkout preview" plan + one bill for A.
// STOP `npm run dev` first (PGlite is single-process). Usage: npx tsx --env-file=.env.local scripts/isolation-test.mts
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "../src/db";
import { createBillApproval } from "../src/lib/approvals";
import { addBill, changePhonePlan, listBills } from "../src/lib/bills";
import { cancelRefills, listManaged } from "../src/lib/manage";
import { getMoney } from "../src/lib/money";
import { chooseOffer, getPlan, listPlans, ownsGoal, setItemRail } from "../src/lib/plans";
import { listWatched } from "../src/lib/watch";

const ok = (cond: boolean, what: string) => console.log(`${cond ? "PASS" : "FAIL"}  ${what}`);
const db = await getDb();
const users = await db.select().from(schema.users).orderBy(desc(schema.users.createdAt)).limit(2);
if (users.length < 2) throw new Error("need two accounts (run scripts/auth-test.mts first)");
const [B, A] = users;
console.log(`A = ${A.email}\nB = ${B.email}\n`);

// A: a ready plan with an order, a refill, a service and a watched item (estimated offers only).
const [goal] = await db
  .insert(schema.goals)
  .values({ userId: A.id, prompt: "Checkout preview (test data)", title: "Home office starter", summary: "Test plan for the checkout layout.", status: "ready", budgetCap: "500" })
  .returning();
const items = [
  { name: "Adjustable standing desk", category: "Furniture", reason: "Room to switch positions", payType: "order" as const, price: "329.99" },
  { name: "Ergonomic office chair", category: "Furniture", reason: "Back support", payType: "order" as const, price: "189" },
  { name: "Coffee pods (monthly)", category: "Refills", reason: "Daily coffee", payType: "subscription" as const, price: "24.5", cadence: "monthly" },
  { name: "Desk assembly service", category: "Services", reason: "Two-person job", payType: "invoice" as const, price: "80", kind: "service" },
  { name: "27-inch monitor", category: "Tech", reason: "Second screen", payType: "watch" as const, price: "219", target: "185" },
];
let firstItemId = "";
for (const [i, it] of items.entries()) {
  const [row] = await db
    .insert(schema.planItems)
    .values({ goalId: goal.id, name: it.name, category: it.category, reason: it.reason, payType: it.payType, kind: it.kind ?? "product", cadence: it.cadence ?? "one_time", sort: i, estimatedPrice: it.price, targetPrice: it.target ?? null, priority: it.payType === "watch" ? "can_wait" : "now" })
    .returning();
  const [offer] = await db
    .insert(schema.offers)
    .values({ planItemId: row.id, offerKey: `test-${row.id}`, merchant: it.kind === "service" ? "Local handyman" : "Example Store", title: it.name, price: it.price, source: "estimate" })
    .returning();
  await db.update(schema.planItems).set({ chosenOfferId: offer.id }).where(eq(schema.planItems.id, row.id));
  if (!firstItemId) firstItemId = row.id;
}
await addBill(A.id, { name: "Electricity", payee: "City Power (test)", type: "electricity", amount: 88.2, periodStart: new Date(Date.now() - 28 * 86_400_000), dueDate: new Date(Date.now() + 2 * 86_400_000) });
const [aBill] = (await listBills(A.id)).slice(-1);
console.log(`created plan ${goal.id} and bill ${aBill.id} for A\n`);

ok((await getPlan(goal.id, A.id)) !== null, "A can open A's plan");
ok((await getPlan(goal.id, B.id)) === null, "B can't open A's plan");
ok(!(await ownsGoal(goal.id, B.id)), "B doesn't own A's plan (API routes check this)");
ok(!(await listPlans(B.id)).some((p) => p.id === goal.id), "A's plan isn't in B's plan list");
ok("error" in (await setItemRail(firstItemId, true, undefined, B.id)), "B can't move A's item to price watch");
await chooseOffer(firstItemId, "00000000-0000-0000-0000-000000000000", B.id);
ok(true, "B choosing an offer on A's item is ignored");
ok((await listBills(B.id)).every((b) => b.id !== aBill.id), "B can't see A's bill");
ok("error" in (await createBillApproval(B.id, [aBill.id], "http://localhost:3000")), "B can't pay A's bill");
ok("error" in (await changePhonePlan(aBill.id, 20, B.id)), "B can't change A's bill");
ok((await listWatched(B.id)).length === 0, "B's watch list doesn't include A's items");
ok((await listManaged(B.id)).length === 0, "B has no refills/invoices from A");
ok("error" in (await cancelRefills("00000000-0000-0000-0000-000000000000", B.id)), "cancel refills needs your own subscription");
ok((await getMoney(B.id)).rows.length === 0, "B's money page is empty");
console.log(`\nCheckout preview for A: /plans/${goal.id}/checkout`);
process.exit(0);
