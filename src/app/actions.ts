"use server";

import { redirect } from "next/navigation";
import { getDb, schema } from "@/db";
import { getDemoUser } from "@/lib/demo-user";
import { chooseOffer } from "@/lib/plans";

export type GoalFormState = { error?: string } | undefined;

export async function createGoal(_prev: GoalFormState, formData: FormData): Promise<GoalFormState> {
  const prompt = String(formData.get("prompt") ?? "").trim();
  const budgetRaw = String(formData.get("budget") ?? "").replace(/[^0-9.]/g, "");
  const photo = String(formData.get("photo") ?? ""); // data URL, already resized in the browser

  if (prompt.length < 8 && !photo) return { error: "Tell us a little more about what's changing." };
  if (prompt.length > 2000) return { error: "That's a bit long. Keep it under 2,000 characters." };
  if (photo && (!photo.startsWith("data:image/") || photo.length > 3_000_000)) return { error: "That photo couldn't be used. Try a smaller JPG or PNG." };

  const user = await getDemoUser();
  const db = await getDb();
  const [goal] = await db
    .insert(schema.goals)
    .values({
      userId: user.id,
      prompt: prompt || "Help me shop for what's in this photo.",
      imageUrl: photo || null,
      budgetCap: budgetRaw ? String(Number(budgetRaw)) : null,
      status: "draft",
    })
    .returning();
  redirect(`/plans/${goal.id}`);
}

export async function selectOffer(itemId: string, offerId: string) {
  await chooseOffer(itemId, offerId);
}
