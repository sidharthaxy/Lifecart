// Dev tool: delete ALL user data (accounts, sessions, plans, bills, approvals, payments, price snapshots) for a fresh
// start. Keeps API usage counters (so daily caps still hold) and the coupon list. PayPal sandbox records are untouched.
// STOP `npm run dev` first (PGlite is single-process).
// Dry run:  npx tsx --env-file=.env.local scripts/wipe-data.mts
// Wipe:     npx tsx --env-file=.env.local scripts/wipe-data.mts --apply
import { sql } from "drizzle-orm";
import { getDb } from "../src/db";

const apply = process.argv.includes("--apply");
const db = await getDb();
// Children first. Tables that don't exist yet (before the auth schema push) are skipped.
const tables = ["sessions", "auth_codes", "payments", "approvals", "watches", "price_snapshots", "offers", "plan_items", "goals", "bills", "users"];

const exists = async (t: string) =>
  ((await db.execute(sql`select to_regclass(${"public." + t}) as r`)) as unknown as { rows: { r: string | null }[] }).rows[0]?.r != null;

for (const t of tables) {
  if (!(await exists(t))) {
    console.log(`${t.padEnd(16)} (no table yet)`);
    continue;
  }
  const res = (await db.execute(sql.raw(`select count(*)::int as n from "${t}"`))) as unknown as { rows: { n: number }[] };
  console.log(`${t.padEnd(16)} ${res.rows[0].n} rows`);
}
if (!apply) {
  console.log("\nDry run. Add --apply to delete all of the above.");
  process.exit(0);
}
for (const t of tables) if (await exists(t)) await db.execute(sql.raw(`delete from "${t}"`));
console.log("\nWiped. Everyone starts fresh on next sign-in.");
process.exit(0);
