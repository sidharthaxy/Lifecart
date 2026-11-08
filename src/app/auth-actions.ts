"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { UserPrefs } from "@/db/schema";
import { requestCode, verifyCode } from "@/lib/auth/codes";
import { endSession, getSessionUser, startSession } from "@/lib/auth/session";
import { clientKey } from "@/lib/guard/ratelimit";
import { cleanText, parseBudget } from "@/lib/guard/sanitize";

export type SignInState = { step: "email" | "code"; email?: string; error?: string; info?: string } | undefined;

/** One form, two steps: email -> 6-digit code. Existing accounts go straight in; new ones go to /welcome. */
export async function signInStep(prev: SignInState, form: FormData): Promise<SignInState> {
  const client = clientKey(await headers());
  const intent = String(form.get("intent") ?? "");

  if (intent === "change") return { step: "email", email: prev?.email };

  if (intent === "send" || intent === "resend") {
    const res = await requestCode(form.get("email") ?? prev?.email, client);
    if ("error" in res) return { step: intent === "resend" ? "code" : "email", email: String(form.get("email") ?? prev?.email ?? ""), error: res.error };
    return { step: "code", email: res.email, info: intent === "resend" ? "We sent a new code." : undefined };
  }

  const email = String(form.get("email") ?? prev?.email ?? "");
  const res = await verifyCode(email, form.get("code"), client);
  if ("error" in res) return { step: "code", email, error: res.error };
  await startSession(res.userId);
  const db = await getDb();
  const [u] = await db.select({ onboardedAt: schema.users.onboardedAt }).from(schema.users).where(eq(schema.users.id, res.userId));
  redirect(u?.onboardedAt ? "/" : "/welcome");
}

export async function signOut() {
  await endSession();
  redirect("/");
}

export async function signOutEverywhere() {
  await endSession({ everywhere: true });
  redirect("/");
}

export type ProfileState = { error?: string; ok?: boolean } | undefined;

/** Shared by the welcome questions (first time) and the profile page. */
export async function saveProfile(_prev: ProfileState, form: FormData): Promise<ProfileState> {
  const user = await getSessionUser();
  if (!user) return { error: "Please sign in again." };
  const onboarding = form.get("onboarding") === "1";

  const name = cleanText(form.get("name"), 60);
  if (name.length < 1) return { error: "Tell us what to call you." };
  const budgetRaw = String(form.get("monthlyBudget") ?? "").trim();
  const budget = budgetRaw ? parseBudget(budgetRaw) : null;
  if (budgetRaw && !budget) return { error: "Enter a monthly shopping budget like 800." };
  const shipTo = cleanText(form.get("shipTo"), 120) || null;
  const dayRaw = Number(form.get("budgetDay") ?? 1);
  const budgetDay = Number.isInteger(dayRaw) && dayRaw >= 1 && dayRaw <= 28 ? dayRaw : 1;
  const on = (k: string) => form.get(k) === "on";
  const prefs: UserPrefs = {
    ...user.prefs,
    payInParts: on("payInParts"),
    alertPriceDrops: on("alertPriceDrops"),
    alertBills: on("alertBills"),
    ...(onboarding ? {} : { demoTools: on("demoTools") }),
  };

  const db = await getDb();
  await db
    .update(schema.users)
    .set({ name, monthlyBudget: budget ? String(budget) : null, budgetDay, shipTo, prefs, ...(user.onboardedAt ? {} : { onboardedAt: new Date() }) })
    .where(eq(schema.users.id, user.id));
  if (onboarding) redirect("/");
  revalidatePath("/", "layout");
  return { ok: true };
}

// ---- WhatsApp number (Profile / Welcome) -----------------------------------------------------------

export type PhoneState = { step: "number" | "code" | "done"; masked?: string; error?: string; info?: string } | undefined;

/** One form, three intents: send a code to a number, check the code, or remove the number. */
export async function phoneStep(prev: PhoneState, form: FormData): Promise<PhoneState> {
  const user = await getSessionUser();
  if (!user) return { step: "number", error: "Please sign in again." };
  const { confirmPhone, removePhone, startPhoneVerification } = await import("@/lib/phone");
  const intent = String(form.get("intent") ?? "");

  if (intent === "remove") {
    await removePhone(user.id);
    revalidatePath("/profile");
    return { step: "number", info: "Number removed. You won't get WhatsApp alerts." };
  }
  if (intent === "change") return { step: "number" };
  if (intent === "send" || intent === "resend") {
    const res = await startPhoneVerification(user.id, form.get("phone") ?? "");
    if ("error" in res) return { step: intent === "resend" ? "code" : "number", masked: prev?.masked, error: res.error };
    return { step: "code", masked: res.masked, info: intent === "resend" ? "We sent a new code." : undefined };
  }
  const res = await confirmPhone(user.id, form.get("code"));
  if ("error" in res) return { step: "code", masked: prev?.masked, error: res.error };
  revalidatePath("/profile");
  return { step: "done", masked: res.masked };
}

/** Delete the account and everything in it (blocked while refills are active). */
export async function deleteMyAccount(): Promise<{ error?: string }> {
  const user = await getSessionUser();
  if (!user) return { error: "Please sign in again." };
  const { deleteAccount } = await import("@/lib/users");
  const res = await deleteAccount(user.id);
  if ("error" in res) return { error: res.error };
  await endSession();
  redirect("/");
}
