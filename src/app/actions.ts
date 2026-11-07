"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createGoalSafely } from "@/lib/goals";
import { clientKey } from "@/lib/guard/ratelimit";
import { chooseOffer } from "@/lib/plans";

export type GoalFormState = { error?: string; selfHarm?: boolean } | undefined;

export async function createGoal(_prev: GoalFormState, formData: FormData): Promise<GoalFormState> {
  const res = await createGoalSafely({
    prompt: formData.get("prompt"),
    budget: formData.get("budget"),
    photo: formData.get("photo"),
    client: clientKey(await headers()),
  });
  if ("error" in res) return { error: res.error, selfHarm: res.selfHarm };
  redirect(`/plans/${res.id}`);
}

export async function selectOffer(itemId: string, offerId: string) {
  if (!/^[0-9a-f-]{36}$/.test(itemId) || !/^[0-9a-f-]{36}$/.test(offerId)) return;
  await chooseOffer(itemId, offerId);
}
