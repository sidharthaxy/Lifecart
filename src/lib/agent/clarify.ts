import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { ClarifyQuestion } from "@/db/schema";
import { aiConfigured } from "@/lib/ai";
import { clarify, describePhoto } from "./planner";

/** Returns the goal's clarifying questions, asking the model once and caching the result. */
export async function getOrAskQuestions(goalId: string): Promise<ClarifyQuestion[] | null> {
  const db = await getDb();
  const [goal] = await db.select().from(schema.goals).where(eq(schema.goals.id, goalId));
  if (!goal) return null;
  if (goal.questions) return goal.questions;

  let imageNote = goal.imageNote;
  if (goal.imageUrl && !imageNote && aiConfigured()) {
    imageNote = await describePhoto(goal.imageUrl).catch(() => null);
  }

  let questions: ClarifyQuestion[] = [];
  if (aiConfigured()) {
    questions = await clarify({ prompt: goal.prompt, budget: goal.budgetCap ? Number(goal.budgetCap) : null, imageNote }).catch(() => []);
  }
  await db
    .update(schema.goals)
    .set({ questions, imageNote, answers: questions.length ? null : {} })
    .where(eq(schema.goals.id, goalId));
  return questions;
}

export async function saveAnswers(goalId: string, answers: Record<string, string>) {
  const db = await getDb();
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(answers)) {
    const s = String(v ?? "").trim().slice(0, 300);
    if (/^q\d$/.test(k) && s) clean[k] = s;
  }
  await db.update(schema.goals).set({ answers: clean }).where(eq(schema.goals.id, goalId));
}
