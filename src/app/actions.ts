"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createCartApproval, startPayment } from "@/lib/approvals";
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

export type PayState = { error: string } | undefined;

/**
 * "Pay with PayPal" on the checkout page: freeze the amounts in a single-use approval and go straight to PayPal.
 * (WhatsApp is only for when LifeCart reaches out: price drops, bills due, renewals.)
 */
export async function payNow(goalId: string): Promise<PayState> {
  if (!isId(goalId)) return { error: "Unknown plan" };
  const h = await headers();
  const rl = allow(`pay:${clientKey(h)}`, 20, 60 * 60_000);
  if (!rl.ok) return { error: "Too many payment attempts. Try again in a few minutes." };
  const origin = appOrigin(h);
  const created = await createCartApproval(goalId, origin, { notify: false });
  if ("error" in created) return { error: created.error };
  const started = await startPayment(created.token, origin);
  if ("error" in started) return { error: started.error };
  redirect(started.redirect);
}
