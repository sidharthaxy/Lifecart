// One-off: copy every table from the embedded database (./.data/pglite) into the Postgres in DATABASE_URL.
// Leaves ./.data/pglite untouched (it stays as a backup). Skips rows that already exist. STOP `npm run dev` first.
// Usage: npx tsx --env-file=.env.local scripts/copy-pglite-to-postgres.mts
import { drizzle as pgliteDrizzle } from "drizzle-orm/pglite";
import { drizzle as pgDrizzle } from "drizzle-orm/node-postgres";
import * as schema from "../src/db/schema";

const url = process.env.DATABASE_URL?.trim();
if (!url) throw new Error("Set DATABASE_URL in .env.local first");
const from = pgliteDrizzle({ connection: { dataDir: "./.data/pglite" }, schema });
const to = pgDrizzle({ connection: url, schema });

// Parents before children (foreign keys).
const tables = [
  ["users", schema.users],
  ["auth_codes", schema.authCodes],
  ["sessions", schema.sessions],
  ["goals", schema.goals],
  ["plan_items", schema.planItems],
  ["offers", schema.offers],
  ["price_snapshots", schema.priceSnapshots],
  ["coupons", schema.coupons],
  ["bills", schema.bills],
  ["watches", schema.watches],
  ["approvals", schema.approvals],
  ["payments", schema.payments],
  ["api_usage", schema.apiUsage],
] as const;

for (const [name, table] of tables) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (await from.select().from(table as any)) as any[];
  let copied = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = (await to.insert(table as any).values(chunk).onConflictDoNothing().returning()) as unknown[];
    copied += res.length;
  }
  console.log(`${name.padEnd(16)} ${String(rows.length).padStart(5)} rows, ${copied} copied`);
}
process.exit(0);
