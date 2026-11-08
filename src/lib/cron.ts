import { timingSafeEqual } from "node:crypto";
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
  watch: { checked: number; alerts: number; whatsappSent: boolean } | { error: string };
  bills: { reminded: number; whatsappSent: boolean } | { error: string };
};

// Single-flight + minimum spacing, so a misconfigured scheduler (or retries) can't burn Channel3/Twilio quota.
// Per-item cooldowns in watch.ts and bills.ts still apply on top of this.
const MIN_GAP_MS = 60 * 60_000;
let running: Promise<DailyResult> | null = null;
let last: DailyResult | null = null;

export async function runDaily(origin: string, { force = false } = {}): Promise<{ skipped?: string; result: DailyResult | null }> {
  if (running) return { skipped: "already running", result: await running };
  if (!force && last && Date.now() - new Date(last.ranAt).getTime() < MIN_GAP_MS) return { skipped: "ran less than an hour ago", result: last };
  running = (async () => {
    const out: DailyResult = { ranAt: new Date().toISOString(), watch: { error: "not run" }, bills: { error: "not run" } };
    // Sequential on purpose: each sends at most one WhatsApp digest, and both share the Twilio budget.
    try {
      const { results, whatsapp } = await checkWatches(origin);
      out.watch = { checked: results.length, alerts: results.filter((r) => r.status === "hit").length, whatsappSent: whatsapp?.sent ?? false };
    } catch (e) {
      out.watch = { error: (e as Error).message.slice(0, 200) };
    }
    try {
      const r = await remindDueBills(origin);
      out.bills = { reminded: r.count, whatsappSent: r.whatsapp?.sent ?? false };
    } catch (e) {
      out.bills = { error: (e as Error).message.slice(0, 200) };
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
