/**
 * Small in-memory sliding-window limiter (per server instance). Enough to stop someone hammering the
 * free-tier APIs through a public demo; not a substitute for a real gateway.
 */
const hits = new Map<string, number[]>();

export function allow(key: string, limit: number, windowMs: number): { ok: boolean; retryInSec: number } {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return { ok: false, retryInSec: Math.ceil((windowMs - (now - recent[0])) / 1000) };
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
  return { ok: true, retryInSec: 0 };
}

/** Best-effort client id from proxy headers (Render sets x-forwarded-for). */
export function clientKey(h: Headers): string {
  return (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "local").trim();
}

export const LIMITS = {
  newPlan: { limit: 12, windowMs: 60 * 60_000 }, // 12 new plans per visitor per hour
  answers: { limit: 30, windowMs: 60 * 60_000 },
};
