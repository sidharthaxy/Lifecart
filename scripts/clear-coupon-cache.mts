// Dev tool: forget all cached coupon searches (public web data, no user data), so the next "Find coupons" searches again.
// STOP `npm run dev` first (PGlite is single-process). Usage: npx tsx --env-file=.env.local scripts/clear-coupon-cache.mts
import { getDb, schema } from "../src/db";

const db = await getDb();
const gone = await db.delete(schema.coupons).returning();
console.log(`Cleared ${gone.length} cached coupon rows: ${[...new Set(gone.map((r) => r.domain))].join(", ") || "none"}`);
process.exit(0);
