import { timingSafeEqual } from "node:crypto";
import { isNotNull } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { env } from "./env";
import { remindDueBills } from "./bills";
import { checkWatches } from "./watch";

/** Scheduled endpoints accept only `Authorization: Bearer $APPROVAL_SECRET` (constant-time compare). */
export function isCronAuthorized(req: Request) {
  const given = Buffer.from(req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "");
  const expected = Buffer.from(env.approvalSecret ?? "");
  return expected.length > 0 && given.length === expected.length && timingSafeEqual(given, expected);
}

type DailyResult = {
  ranAt: string;
  users: number;
  watch: { checked: number; alerts: number; whatsappSent: number; errors: number };
  bills: { reminded: number; whatsappSent: number; errors: number };
};

// Single-flight + minimum spacing, so a misconfigured scheduler (or retries) can't burn Channel3/Twilio quota.
// Per-item cooldowns in watch.ts and bills.ts still apply on top of this.
const MIN_GAP_MS = 60 * 60_000;
const MAX_USERS_PER_RUN = 200;
let running: Promise<DailyResult> | null = null;
let last: DailyResult | null = null;

export async function runDaily(origin: string, { force = false } = {}): Promise<{ skipped?: string; result: DailyResult | null }> {
  if (running) return { skipped: "already running", result: await running };
  if (!force && last && Date.now() - new Date(last.ranAt).getTime() < MIN_GAP_MS) return { skipped: "ran less than an hour ago", result: last };
  running = (async () => {
    const out: DailyResult = {
      ranAt: new Date().toISOString(),
      users: 0,
      watch: { checked: 0, alerts: 0, whatsappSent: 0, errors: 0 },
      bills: { reminded: 0, whatsappSent: 0, errors: 0 },
    };
    const db = await getDb();
    const users = await db.select({ id: schema.users.id, prefs: schema.users.prefs }).from(schema.users).where(isNotNull(schema.users.onboardedAt)).limit(MAX_USERS_PER_RUN);
    out.users = users.length;
    // Per user, sequential on purpose: each user gets at most one price digest and one bill digest per run,
    // and everyone shares the Channel3/Twilio budgets (usage caps in lib/usage.ts still apply).
    for (const u of users) {
      if (u.prefs?.alertPriceDrops !== false) {
        try {
          const { results, whatsapp } = await checkWatches(origin, { userId: u.id });
          out.watch.checked += results.length;
          out.watch.alerts += results.filter((r) => r.status === "hit").length;
          if (whatsapp?.sent) out.watch.whatsappSent++;
        } catch {
          out.watch.errors++;
        }
      }
      if (u.prefs?.alertBills !== false) {
        try {
          const r = await remindDueBills(origin, u.id);
          out.bills.reminded += r.count;
          if (r.whatsapp?.sent) out.bills.whatsappSent++;
        } catch {
          out.bills.errors++;
        }
      }
    }
    return out;
  })();
  try {
    last = await running;
    return { result: last };
  } finally {
    running = null;
  }
}
