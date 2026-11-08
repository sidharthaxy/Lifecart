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
    .set({ name, monthlyBudget: budget ? String(budget) : null, shipTo, prefs, ...(user.onboardedAt ? {} : { onboardedAt: new Date() }) })
    .where(eq(schema.users.id, user.id));
  if (onboarding) redirect("/");
  revalidatePath("/", "layout");
  return { ok: true };
}
