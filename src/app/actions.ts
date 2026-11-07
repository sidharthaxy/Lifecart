"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createCartApproval } from "@/lib/approvals";
import { createGoalSafely } from "@/lib/goals";
import { allow, clientKey } from "@/lib/guard/ratelimit";
import { appOrigin } from "@/lib/origin";
import { chooseOffer, setItemRail } from "@/lib/plans";

const isId = (s: unknown): s is string => typeof s === "string" && /^[0-9a-f-]{36}$/.test(s);

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
  if (!isId(itemId) || !isId(offerId)) return;
  await chooseOffer(itemId, offerId);
}

/** Move a product to price watch (with a target) or back to buying now. */
export async function moveToWatch(itemId: string, watch: boolean, target?: number) {
  if (!isId(itemId)) return { error: "Unknown item" };
  return setItemRail(itemId, watch, target);
}

export type SendApprovalState =
  | { link: string; message: string; sent: boolean; reason?: string }
  | { error: string }
  | undefined;

/** "Send to WhatsApp for approval" on the checkout page. */
export async function sendForApproval(goalId: string): Promise<SendApprovalState> {
  if (!isId(goalId)) return { error: "Unknown plan" };
  const h = await headers();
  const rl = allow(`approval:${clientKey(h)}`, 10, 60 * 60_000);
  if (!rl.ok) return { error: "Too many approval messages. Try again in a few minutes." };
  const res = await createCartApproval(goalId, appOrigin(h));
  if ("error" in res) return { error: res.error };
  return { link: res.link, message: res.message, sent: res.whatsapp.sent, reason: res.whatsapp.sent ? undefined : res.whatsapp.reason };
}
