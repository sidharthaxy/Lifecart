import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { ShieldCheck, Lock, Store, ChevronRight } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { GoalForm } from "@/components/goal-form";
import { listPlans } from "@/lib/plans";

const STEPS = [
  ["01", "Describe your life", "Plain words or a photo. The agent reads your schedule, space and budget."],
  ["02", "Get a priced plan", "Every item explained, matched to a real store listing and checked against 90-day price history."],
  ["03", "Pay with PayPal", "One confirmation covers orders, refills and service invoices. Nothing moves without your approval."],
  ["04", "Alerts on WhatsApp", "When a watched price drops or a bill is due, we message you a link back here to pay."],
] as const;

async function RecentPlans() {
  await connection();
  const plans = await listPlans(4);
  if (!plans.length) return null;
  return (
    <section aria-labelledby="recent" className="flex flex-col gap-4">
      <h2 id="recent" className="text-[22px] font-bold">
        Your plans
      </h2>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-4">
        {plans.map((p) => (
          <Link
            key={p.id}
            href={`/plans/${p.id}`}
            className="flex items-center gap-3 rounded-2xl border border-border bg-card px-5 py-4 text-foreground no-underline hover:border-primary/40"
          >
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-semibold">{p.title ?? "Plan in progress"}</span>
              <span className="truncate text-[13px] text-muted-foreground">{p.prompt}</span>
            </span>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          </Link>
        ))}
      </div>
    </section>
  );
}

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader active="home" />
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-14 px-4 pb-12 pt-14 sm:px-6">
        <section className="flex flex-col items-center gap-5 text-center">
          <span className="text-[13px] font-semibold uppercase tracking-wide text-primary">Your life, planned and paid</span>
          <h1 className="max-w-[820px] text-[clamp(34px,5vw,56px)] font-extrabold leading-[1.08] tracking-[-0.03em]">
            Tell us what&apos;s changing. We&apos;ll plan the shopping and handle the bills.
          </h1>
          <p className="max-w-[640px] text-lg text-muted-foreground">
            Describe your situation or drop a photo. LifeCart builds a complete, budgeted list with real prices and price history, then pays through PayPal when you confirm. Price drops and bills come to you on WhatsApp.
          </p>
        </section>

        <GoalForm />

        <Suspense fallback={null}>
          <RecentPlans />
        </Suspense>

        <section aria-labelledby="how" className="flex flex-col gap-5">
          <h2 id="how" className="text-[22px] font-bold">
            How it works
          </h2>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-4">
            {STEPS.map(([n, title, body]) => (
              <div key={n} className="flex flex-col gap-2.5 rounded-2xl border border-border bg-card p-5">
                <span className="text-[13px] font-semibold text-primary">{n}</span>
                <h3 className="text-[17px] font-semibold">{title}</h3>
                <p className="text-sm text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>
        </section>

        <section aria-label="Why it's safe" className="flex flex-wrap justify-center gap-x-8 gap-y-3 border-t border-border py-5 text-sm text-muted-foreground">
          <span className="flex items-center gap-2">
            <ShieldCheck className="size-[18px] text-primary" aria-hidden /> Nothing is paid without your approval
          </span>
          <span className="flex items-center gap-2">
            <Lock className="size-[18px] text-primary" aria-hidden /> Checkout runs on PayPal
          </span>
          <span className="flex items-center gap-2">
            <Store className="size-[18px] text-primary" aria-hidden /> Independent stores shown when prices are close
          </span>
        </section>
      </main>
      <footer className="mx-auto w-full max-w-6xl px-4 pb-8 text-[13px] text-muted-foreground sm:px-6">
        Sandbox demo for the PayPal AI Hackathon 2026. Product data from Channel3.
      </footer>
    </div>
  );
}
