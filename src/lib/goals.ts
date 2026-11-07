import { getDb, schema } from "@/db";
import { getDemoUser } from "./demo-user";
import { screenRequest } from "./guard/check";
import { allow, LIMITS } from "./guard/ratelimit";
import { cleanText, parseBudget } from "./guard/sanitize";

export type CreateGoalResult = { id: string } | { error: string; selfHarm?: boolean };

const PHOTO_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;

/**
 * The only way a plan gets created (form, JSON API, later WhatsApp). Runs guard layers 1-3 before anything
 * is stored, so blocked requests never reach the planner or spend search credits.
 */
export async function createGoalSafely(input: { prompt: unknown; budget?: unknown; photo?: unknown; client: string }): Promise<CreateGoalResult> {
  const rl = allow(`plan:${input.client}`, LIMITS.newPlan.limit, LIMITS.newPlan.windowMs);
  if (!rl.ok) return { error: `You've started a lot of plans recently. Try again in ${Math.ceil(rl.retryInSec / 60)} minutes.` };

  const prompt = cleanText(input.prompt, 1000);
  const photo = typeof input.photo === "string" ? input.photo : "";
  if (photo && (!PHOTO_RE.test(photo) || photo.length > 3_000_000)) return { error: "That photo couldn't be used. Try a JPG or PNG." };
  if (prompt.length < 8 && !photo) return { error: "Tell us a little more about what's changing." };

  const verdict = await screenRequest([{ label: "request", text: prompt }]);
  if (!verdict.ok) return { error: verdict.message, selfHarm: verdict.selfHarm };

  const user = await getDemoUser();
  const db = await getDb();
  const budget = parseBudget(input.budget);
  const [goal] = await db
    .insert(schema.goals)
    .values({
      userId: user.id,
      prompt: prompt || "Help me shop for what's in this photo.",
      imageUrl: photo || null,
      budgetCap: budget ? String(budget) : null,
      status: "draft",
    })
    .returning();
  return { id: goal.id };
}
