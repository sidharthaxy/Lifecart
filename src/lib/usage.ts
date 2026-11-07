import { and, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";

/**
 * API usage guard rails for free tiers.
 *
 *  - record(): counts calls/units per provider per UTC day (shown on /setup).
 *  - canSpend(): daily soft caps, kept well under each provider's real limit so a demo never hits a wall.
 *  - groqGate(): respects Groq's per-minute token limit using the x-ratelimit-* headers of the last response,
 *    waiting (bounded) instead of failing with a 429.
 *  - withTimeout(): every external call has a hard deadline, so nothing can hang a run.
 */

export type Provider = "groq" | "channel3" | "kernel" | "twilio" | "paypal";

/** Daily soft caps. Groq free tier: 1,000 req/day per model; Channel3: 21,000 credits total for the hackathon. */
export const DAILY_CAPS: Record<Provider, { calls?: number; units?: number; label: string }> = {
  groq: { calls: 800, label: "AI requests (Groq allows 1,000/day per model)" },
  channel3: { units: 2500, label: "product-search credits (≈21,000 total for the hackathon)" },
  kernel: { calls: 60, label: "cloud-browser sessions ($50 credit)" },
  twilio: { calls: 100, label: "WhatsApp messages (trial credit)" },
  paypal: { calls: 2000, label: "PayPal sandbox calls (no cost)" },
};

const today = () => new Date().toISOString().slice(0, 10);

export async function record(provider: Provider, opts: { calls?: number; units?: number; meta?: Record<string, string | number> } = {}) {
  try {
    const db = await getDb();
    const calls = opts.calls ?? 1;
    const units = opts.units ?? 0;
    await db
      .insert(schema.apiUsage)
      .values({ day: today(), provider, calls, units, meta: opts.meta ?? null })
      .onConflictDoUpdate({
        target: [schema.apiUsage.day, schema.apiUsage.provider],
        set: {
          calls: sql`${schema.apiUsage.calls} + ${calls}`,
          units: sql`${schema.apiUsage.units} + ${units}`,
          ...(opts.meta ? { meta: opts.meta } : {}),
          updatedAt: new Date(),
        },
      });
  } catch {
    // usage tracking must never break the product
  }
}

export async function usageToday() {
  const db = await getDb();
  return db.select().from(schema.apiUsage).where(eq(schema.apiUsage.day, today()));
}

/** True if spending `calls`/`units` more today stays under the soft cap. */
export async function canSpend(provider: Provider, need: { calls?: number; units?: number } = { calls: 1 }) {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(schema.apiUsage)
    .where(and(eq(schema.apiUsage.day, today()), eq(schema.apiUsage.provider, provider)));
  const cap = DAILY_CAPS[provider];
  if (cap.calls != null && (row?.calls ?? 0) + (need.calls ?? 0) > cap.calls) return false;
  if (cap.units != null && (row?.units ?? 0) + (need.units ?? 0) > cap.units) return false;
  // Groq also tells us its own remaining daily requests; trust it if lower.
  const remaining = Number(row?.meta?.["remaining-requests"]);
  if (provider === "groq" && Number.isFinite(remaining) && remaining < 15) return false;
  return true;
}

// ---- Groq per-minute token gate -------------------------------------------------------------

type Gate = { remainingTokens: number; resetAt: number };
const gates = new Map<string, Gate>();

/** "13.5s" | "2m52.8s" | "750ms" -> milliseconds */
function parseDuration(s: string | null | undefined): number {
  if (!s) return 0;
  let ms = 0;
  for (const [, n, unit] of s.matchAll(/([\d.]+)(ms|h|m|s)/g)) {
    const v = Number(n);
    ms += unit === "ms" ? v : unit === "s" ? v * 1000 : unit === "m" ? v * 60_000 : v * 3_600_000;
  }
  return ms;
}

/** Call after every Groq response with its headers and token usage. */
export async function recordGroq(model: string, headers: Record<string, string> | undefined, tokens: number) {
  const h = headers ?? {};
  const remTok = Number(h["x-ratelimit-remaining-tokens"]);
  if (Number.isFinite(remTok)) gates.set(model, { remainingTokens: remTok, resetAt: Date.now() + parseDuration(h["x-ratelimit-reset-tokens"]) });
  const meta: Record<string, string | number> = { model };
  if (h["x-ratelimit-remaining-requests"]) meta["remaining-requests"] = Number(h["x-ratelimit-remaining-requests"]);
  if (h["x-ratelimit-limit-requests"]) meta["limit-requests"] = Number(h["x-ratelimit-limit-requests"]);
  if (Number.isFinite(remTok)) meta["remaining-tokens-this-minute"] = remTok;
  await record("groq", { calls: 1, units: tokens, meta });
}

/**
 * Before a Groq call: if the last response said we're short on this minute's tokens, wait for the reset.
 * Bounded to `maxWaitMs`; never loops.
 */
export async function groqGate(model: string, estTokens: number, maxWaitMs = 25_000) {
  const g = gates.get(model);
  if (!g || g.remainingTokens >= estTokens) return 0;
  const wait = Math.min(Math.max(0, g.resetAt - Date.now()) + 250, maxWaitMs);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  gates.delete(model);
  return wait;
}

// ---- Timeouts ----------------------------------------------------------------------------------

export class TimeoutError extends Error {}

/** Thrown when a daily soft cap would be exceeded. */
export class BudgetError extends Error {
  constructor(public provider: Provider) {
    super(`Daily ${provider} budget reached`);
  }
}

/** Reject if `p` doesn't settle within `ms`. */
export function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let t: ReturnType<typeof setTimeout>;
  return Promise.race([
    p.finally(() => clearTimeout(t)),
    new Promise<T>((_, reject) => {
      t = setTimeout(() => reject(new TimeoutError(`${label} timed out after ${Math.round(ms / 1000)}s`)), ms);
    }),
  ]);
}
