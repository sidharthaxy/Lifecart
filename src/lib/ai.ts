import { createGroq } from "@ai-sdk/groq";
import { env } from "./env";

/**
 * One place to choose models. Everything else imports `models.*` so we can
 * swap provider (AI_PROVIDER) without touching agent code.
 *
 * Groq free tier (per organization): roughly 30 req/min and 200K tokens/day
 * for gpt-oss-120b. Cache plans and keep tool outputs short.
 */
const groq = createGroq({ apiKey: env.groqApiKey });

export const models = {
  /** Main agent: planning, tool calls, checkout split, structured plan JSON. */
  agent: () => groq("openai/gpt-oss-120b"),
  /** Photo input: vision + tool use, up to 3 images per request (≤20 MB each). */
  vision: () => groq("qwen/qwen3.8-27b"),
  /** Cheap, high-volume jobs: coupon extraction, bill parsing, message copy. */
  fast: () => groq("openai/gpt-oss-20b"),
};

export const aiConfigured = () => Boolean(env.groqApiKey);
