import { createGroq } from "@ai-sdk/groq";
import { env } from "./env";
import { BudgetError, canSpend, groqGate, recordGroq } from "./usage";

/**
 * One place to choose models. Everything else imports `models.*` so we can
 * swap provider (AI_PROVIDER) without touching agent code.
 *
 * Groq free tier (per organization, per model): 1,000 requests/day and 8,000 tokens/minute
 * for gpt-oss-120b. guardedGroq() below keeps us inside those limits.
 */
const groq = createGroq({ apiKey: env.groqApiKey });

export const MODEL_IDS = {
  /** Main agent: questions, planning, offer matching. */
  agent: "openai/gpt-oss-120b",
  /** Photo input: vision + tool use, up to 3 images per request (≤20 MB each). */
  vision: "qwen/qwen3.8-27b",
  /** Cheap, high-volume jobs: coupon extraction, bill parsing, message copy. */
  fast: "openai/gpt-oss-20b",
} as const;
export type ModelKind = keyof typeof MODEL_IDS;

export const models = {
  agent: () => groq(MODEL_IDS.agent),
  vision: () => groq(MODEL_IDS.vision),
  fast: () => groq(MODEL_IDS.fast),
};

export const aiConfigured = () => Boolean(env.groqApiKey);

type Result = { response?: { headers?: Record<string, string> }; usage?: { totalTokens?: number } };

/**
 * Every Groq call goes through here:
 *  1. stop if today's soft cap is reached (BudgetError),
 *  2. wait (bounded) if the last response said this minute's tokens are nearly used,
 *  3. hard timeout via AbortSignal,
 *  4. record usage + Groq's own remaining-limit headers for /setup.
 */
export async function guardedGroq<T extends Result>(
  kind: ModelKind,
  estTokens: number,
  call: (signal: AbortSignal) => Promise<T>,
  timeoutMs = 45_000,
): Promise<T> {
  if (!(await canSpend("groq", { calls: 1 }))) throw new BudgetError("groq");
  await groqGate(MODEL_IDS[kind], estTokens);
  try {
    const res = await call(AbortSignal.timeout(timeoutMs));
    await recordGroq(MODEL_IDS[kind], res.response?.headers, res.usage?.totalTokens ?? 0);
    return res;
  } catch (err) {
    // Failed calls still count against Groq's request limit.
    await recordGroq(MODEL_IDS[kind], undefined, 0);
    throw err;
  }
}
