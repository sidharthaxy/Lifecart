import { timingSafeEqual } from "node:crypto";
import { eq, isNotNull } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { env } from "./env";
import { remindDueBills } from "./bills";
import { checkWatches } from "./watch";

/**
 * The daily job: for every signed-up user, check watched prices, then send due-bill reminders.
 * Two ways to run it:
 *  - Render Workflows (production): /api/cron/daily starts the `dailyAlerts` task, which fans out one
 *    `checkUser` task per user, each on its own compute with automatic retries (see workflows/main.ts).
 *  - In the app (local dev, or if Workflows isn't configured): runDaily() below, one user after another.
 * Both use checkUserDaily(), so the behaviour is identical. Per-user cooldowns (24 h per item) and the daily
 * usage caps in lib/usage.ts protect WhatsApp, Channel3 and Twilio whichever path runs.
 */

/** Scheduled endpoints accept only `Authorization: Bearer $APPROVAL_SECRET` (constant-time compare). */
export function isCronAuthorized(req: Request) {
  const given = Buffer.from(req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "");
  const expected = Buffer.from(env.approvalSecret ?? "");
  return expected.length > 0 && given.length === expected.length && timingSafeEqual(given, expected);
}

export const MAX_USERS_PER_RUN = 200;

export type UserDailyResult = {
  userId: string;
  watch: { checked: number; alerts: number; whatsappSent: boolean } | null;
  bills: { reminded: number; whatsappSent: boolean } | null;
  errors: string[];
};

export type DailyResult = {
  ranAt: string;
  users: number;
  watch: { checked: number; alerts: number; whatsappSent: number; errors: number };
  bills: { reminded: number; whatsappSent: number; errors: number };
};

/** Signed-up users the daily job should look at. */
export async function dailyUserIds(): Promise<string[]> {
  const db = await getDb();
  const rows = await db.select({ id: schema.users.id }).from(schema.users).where(isNotNull(schema.users.onboardedAt)).limit(MAX_USERS_PER_RUN);
  return rows.map((r) => r.id);
}

/**
 * One user's daily check, respecting their alert settings. At most one price digest and one bill digest.
 * Throws only if everything it tried failed, so a workflow retry makes sense (cooldowns prevent double sends).
 */
export async function checkUserDaily(origin: string, userId: string): Promise<UserDailyResult> {
  const db = await getDb();
  const [u] = await db.select({ id: schema.users.id, prefs: schema.users.prefs }).from(schema.users).where(eq(schema.users.id, userId));
  const out: UserDailyResult = { userId, watch: null, bills: null, errors: [] };
  if (!u) return out;
  let tried = 0;
  if (u.prefs?.alertPriceDrops !== false) {
    tried++;
    try {
      const { results, whatsapp } = await checkWatches(origin, { userId });
      out.watch = { checked: results.length, alerts: results.filter((r) => r.status === "hit").length, whatsappSent: Boolean(whatsapp?.sent) };
    } catch (e) {
      out.errors.push(`watch: ${(e as Error).message.slice(0, 160)}`);
    }
  }
  if (u.prefs?.alertBills !== false) {
    tried++;
    try {
      const r = await remindDueBills(origin, userId);
      out.bills = { reminded: r.count, whatsappSent: Boolean(r.whatsapp?.sent) };
    } catch (e) {
      out.errors.push(`bills: ${(e as Error).message.slice(0, 160)}`);
    }
  }
  if (tried > 0 && out.errors.length === tried) throw new Error(`Daily check failed for user ${userId}: ${out.errors.join("; ")}`);
  return out;
}

export function summarize(results: (UserDailyResult | { userId: string; failed: string })[]): DailyResult {
  const out: DailyResult = {
    ranAt: new Date().toISOString(),
    users: results.length,
    watch: { checked: 0, alerts: 0, whatsappSent: 0, errors: 0 },
    bills: { reminded: 0, whatsappSent: 0, errors: 0 },
  };
  for (const r of results) {
    if ("failed" in r) {
      out.watch.errors++;
      out.bills.errors++;
      continue;
    }
    if (r.watch) {
      out.watch.checked += r.watch.checked;
      out.watch.alerts += r.watch.alerts;
      if (r.watch.whatsappSent) out.watch.whatsappSent++;
    }
    if (r.bills) {
      out.bills.reminded += r.bills.reminded;
      if (r.bills.whatsappSent) out.bills.whatsappSent++;
    }
    for (const e of r.errors) {
      if (e.startsWith("watch")) out.watch.errors++;
      else out.bills.errors++;
    }
  }
  return out;
}

// In-app path: single-flight + at least an hour apart, so a misconfigured scheduler can't burn quota.
const MIN_GAP_MS = 60 * 60_000;
let running: Promise<DailyResult> | null = null;
let last: DailyResult | null = null;

export async function runDaily(origin: string, { force = false } = {}): Promise<{ skipped?: string; result: DailyResult | null }> {
  if (running) return { skipped: "already running", result: await running };
  if (!force && last && Date.now() - new Date(last.ranAt).getTime() < MIN_GAP_MS) return { skipped: "ran less than an hour ago", result: last };
  running = (async () => {
    const results: (UserDailyResult | { userId: string; failed: string })[] = [];
    // One user after another: everyone shares the Channel3/Twilio budgets.
    for (const id of await dailyUserIds()) {
      try {
        results.push(await checkUserDaily(origin, id));
      } catch (e) {
        results.push({ userId: id, failed: (e as Error).message });
      }
    }
    return summarize(results);
  })();
  try {
    last = await running;
    return { result: last };
  } finally {
    running = null;
  }
}
