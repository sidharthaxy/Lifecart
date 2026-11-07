import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { ClarifyQuestion } from "@/db/schema";
import { aiConfigured } from "@/lib/ai";
import { screenRequest } from "@/lib/guard/check";
import { cleanText } from "@/lib/guard/sanitize";
import { clarify, describePhoto } from "./planner";

export type AskResult = { questions: ClarifyQuestion[] } | { blocked: string } | null;

/** Returns the goal's clarifying questions, asking the model once and caching the result. */
export async function getOrAskQuestions(goalId: string): Promise<AskResult> {
  const db = await getDb();
  const [goal] = await db.select().from(schema.goals).where(eq(schema.goals.id, goalId));
  if (!goal) return null;
  if (goal.status === "blocked") return { blocked: goal.error ?? "This request can't be planned." };
  if (goal.questions) return { questions: goal.questions };

  let imageNote = goal.imageNote;
  if (goal.imageUrl && !imageNote && aiConfigured()) {
    imageNote = await describePhoto(goal.imageUrl).catch(() => null);
    if (imageNote) {
      // A photo can carry written instructions or show something prohibited: screen what the model saw.
      const verdict = await screenRequest([
        { label: "request", text: goal.prompt },
        { label: "photo", text: imageNote },
      ]);
      if (!verdict.ok) {
        await db.update(schema.goals).set({ status: "blocked", error: verdict.message, imageNote }).where(eq(schema.goals.id, goalId));
        return { blocked: verdict.message };
      }
    }
  }

  let questions: ClarifyQuestion[] = [];
  if (aiConfigured()) {
    questions = await clarify({ prompt: goal.prompt, budget: goal.budgetCap ? Number(goal.budgetCap) : null, imageNote }).catch(() => []);
    questions = questions.map((q) => ({
      id: q.id,
      question: cleanText(q.question, 140),
      why: q.why ? cleanText(q.why, 140) : undefined,
      options: q.options.map((o) => cleanText(o, 60)).filter(Boolean),
    }));
  }
  await db
    .update(schema.goals)
    .set({ questions, imageNote, answers: questions.length ? null : {} })
    .where(eq(schema.goals.id, goalId));
  return { questions };
}

/** Save answers. Tap-to-answer options are trusted; free-text "Other" answers go through the guardrails. */
export async function saveAnswers(goalId: string, answers: Record<string, string>): Promise<{ ok: true } | { error: string }> {
  const db = await getDb();
  const [goal] = await db.select().from(schema.goals).where(eq(schema.goals.id, goalId));
  if (!goal || goal.status !== "draft") return { error: "This plan can't take answers right now." };

  const clean: Record<string, string> = {};
  const freeText: string[] = [];
  for (const q of goal.questions ?? []) {
    const v = cleanText(answers?.[q.id], 200);
    if (!v) continue;
    clean[q.id] = v;
    if (!q.options.includes(v)) freeText.push(`${q.question} -> ${v}`);
  }

  if (freeText.length) {
    const verdict = await screenRequest([
      { label: "request", text: goal.prompt },
      { label: "answers", text: freeText.join("\n") },
    ]);
    if (!verdict.ok) return { error: verdict.message };
  }

  await db.update(schema.goals).set({ answers: clean }).where(eq(schema.goals.id, goalId));
  return { ok: true };
}
