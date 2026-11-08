import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { ProfileForm } from "@/components/auth/profile-form";
import { getSessionUser } from "@/lib/auth/session";
import { num } from "@/lib/format";
import { maskedPhone } from "@/lib/whatsapp";

export const metadata = { title: "Welcome · LifeCart" };

async function Welcome() {
  const user = await getSessionUser();
  if (!user) redirect("/");
  if (user.onboardedAt) redirect("/");
  return (
    <ProfileForm
      onboarding
      demoPhone={maskedPhone()}
      user={{ name: user.name, email: user.email, monthlyBudget: num(user.monthlyBudget), budgetDay: user.budgetDay, shipTo: user.shipTo, prefs: user.prefs }}
    />
  );
}

export default function WelcomePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader signedOut />
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 pb-12 pt-10 sm:px-6">
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold uppercase tracking-wide text-primary">Your email is verified</span>
          <h1 className="text-[34px] font-extrabold leading-tight">A few things before we start</h1>
          <p className="text-muted-foreground">This takes a minute. You can change any of it later in your profile.</p>
        </div>
        <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-muted" />}>
          <Welcome />
        </Suspense>
      </main>
    </div>
  );
}
