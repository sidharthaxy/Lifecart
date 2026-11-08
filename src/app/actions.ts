"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createBillApproval, createCartApproval, startPayment } from "@/lib/approvals";
import { addBill, changePhonePlan, remindDueBills } from "@/lib/bills";
import { cleanText } from "@/lib/guard/sanitize";
import { createGoalSafely } from "@/lib/goals";
import { allow, clientKey } from "@/lib/guard/ratelimit";
import { appOrigin } from "@/lib/origin";
import { chooseOffer, setItemRail } from "@/lib/plans";
import { checkWatches } from "@/lib/watch";
import { cancelRefills } from "@/lib/manage";

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

export type WatchCheckState = { message: string; link?: string } | undefined;

/** "Check prices now" (and the demo-only "simulate a price drop") on the Orders & watch page. */
export async function runWatchCheck(simulateItemId?: string): Promise<WatchCheckState> {
  if (simulateItemId !== undefined && !isId(simulateItemId)) return { message: "Unknown item" };
  const h = await headers();
  const rl = allow(`watch:${clientKey(h)}`, 20, 60 * 60_000);
  if (!rl.ok) return { message: "Too many price checks. Try again in a few minutes." };
  const { results, whatsapp } = await checkWatches(appOrigin(h), { simulateItemId });
  revalidatePath("/orders");
  if (!results.length) return { message: "Nothing is on price watch." };
  const hits = results.filter((r) => r.status === "hit" && r.link);
  const fixed = results.filter((r) => r.status === "retargeted").length;
  const fixedNote = fixed ? ` Reset ${fixed} target(s) that were already above today's price.` : "";
  if (!hits.length) {
    const cooled = results.find((r) => r.status === "hit" && r.note);
    return { message: `Checked ${results.length} item(s). ${cooled ? `${cooled.name}: ${cooled.note}.` : "No real price drop to your target yet."}${fixedNote}` };
  }
  const sent = whatsapp?.sent ? "One WhatsApp alert sent." : `WhatsApp not sent (${whatsapp && !whatsapp.sent ? whatsapp.reason : "unknown"}); use the link below.`;
  const first = hits[0];
  return {
    message: `${hits.length} price drop(s): ${first.name} is now $${first.now?.toFixed(2)} (target $${first.target.toFixed(2)}). ${sent}${fixedNote}`,
    link: first.link,
  };
}

/** Cancel a refills subscription from the Orders page. */
export async function cancelRefillsAction(paymentId: string): Promise<{ status?: string; error?: string }> {
  if (!isId(paymentId)) return { error: "Unknown subscription" };
  const h = await headers();
  const rl = allow(`cancel:${clientKey(h)}`, 10, 60 * 60_000);
  if (!rl.ok) return { error: "Too many attempts. Try again in a few minutes." };
  const res = await cancelRefills(paymentId);
  revalidatePath("/orders");
  return res;
}

// ---- Bills -----------------------------------------------------------------------------------------

/** "Pay" one bill, or "Pay all due this week": freeze amounts and go straight to PayPal. */
export async function payBillsNow(billIds: string[]): Promise<PayState> {
  const ids = (Array.isArray(billIds) ? billIds : []).filter(isId).slice(0, 20);
  if (!ids.length) return { error: "Nothing to pay" };
  const h = await headers();
  const rl = allow(`pay:${clientKey(h)}`, 20, 60 * 60_000);
  if (!rl.ok) return { error: "Too many payment attempts. Try again in a few minutes." };
  const origin = appOrigin(h);
  const created = await createBillApproval(ids, origin, { notify: false });
  if ("error" in created) return { error: created.error };
  const started = await startPayment(created.token, origin);
  if ("error" in started) return { error: started.error };
  redirect(started.redirect);
}

export async function switchPhonePlan(billId: string, price: number) {
  if (!isId(billId) || typeof price !== "number") return { error: "Unknown plan" };
  const res = await changePhonePlan(billId, price);
  revalidatePath("/bills");
  return res;
}

export type AddBillState = { error?: string; ok?: boolean } | undefined;
export async function addBillAction(_prev: AddBillState, form: FormData): Promise<AddBillState> {
  const name = cleanText(form.get("name"), 60);
  const payee = cleanText(form.get("payee"), 80);
  const amount = Number(String(form.get("amount") ?? "").replace(/[^0-9.]/g, ""));
  const due = new Date(String(form.get("dueDate") ?? ""));
  if (name.length < 2 || payee.length < 2) return { error: "Add a name and who you pay." };
  if (!Number.isFinite(amount) || amount <= 0 || amount > 50_000) return { error: "Enter an amount between $0 and $50,000." };
  if (Number.isNaN(due.getTime())) return { error: "Pick a due date." };
  await addBill({ name, payee, type: String(form.get("type") ?? "other"), amount: Math.round(amount * 100) / 100, dueDate: due });
  revalidatePath("/bills");
  return { ok: true };
}

/** "Send reminder now" (the scheduler calls the same thing via /api/bills/remind). */
export async function sendBillReminders(): Promise<{ message: string; link?: string }> {
  const h = await headers();
  const rl = allow(`remind:${clientKey(h)}`, 10, 60 * 60_000);
  if (!rl.ok) return { message: "Too many reminders. Try again in a few minutes." };
  const r = await remindDueBills(appOrigin(h));
  revalidatePath("/bills");
  if (!r.count) return { message: "Nothing due in the next 3 days that hasn't been reminded today." };
  const sent = r.whatsapp?.sent ? "Sent one WhatsApp reminder" : `WhatsApp not sent (${r.whatsapp && !r.whatsapp.sent ? r.whatsapp.reason : "unknown"})`;
  return { message: `${sent} for ${r.count} bill(s), with one PayPal link.`, link: r.link };
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
