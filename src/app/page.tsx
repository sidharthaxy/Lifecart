import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { BellRing, CalendarClock, ChevronRight, Lock, ShieldCheck, Sparkles, Store } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { SignInForm } from "@/components/auth/sign-in-form";
import { ComingUp } from "@/components/coming-up";
import { GoalForm } from "@/components/goal-form";
import { getSessionUser, type User } from "@/lib/auth/session";
import { num } from "@/lib/format";
import { listPlans } from "@/lib/plans";

const STEPS = [
  ["01", "Describe your life", "Plain words or a photo. The agent asks a couple of questions, then reads your schedule, space and budget."],
  ["02", "Get a priced plan", "Every item explained, matched to a real store listing and checked against 90-day price history."],
  ["03", "Pay with PayPal", "One confirmation covers orders, refills and service invoices. Nothing moves without your approval."],
  ["04", "Alerts on WhatsApp", "When a watched price drops or a bill is due, we message you a link back here to pay."],
] as const;

function Footer() {
  return (
    <footer className="mx-auto w-full max-w-6xl px-4 pb-8 text-[13px] text-muted-foreground sm:px-6">
      Sandbox demo for the PayPal AI Hackathon 2026. Payments use PayPal&apos;s sandbox, so no real money moves.
    </footer>
  );
}

/** Signed out: what LifeCart does, and the email sign-in. */
function Landing() {
  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader signedOut />
      <main className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-10 px-4 pb-12 pt-12 sm:px-6 lg:grid-cols-[1.25fr_1fr]">
        <section className="flex flex-col gap-6">
          <span className="text-[13px] font-semibold uppercase tracking-wide text-primary">Your life, planned and paid</span>
          <h1 className="text-[clamp(34px,5vw,54px)] font-extrabold leading-[1.08] tracking-[-0.03em]">Tell us what&apos;s changing. We&apos;ll plan the shopping and handle the bills.</h1>
          <p className="max-w-[560px] text-lg text-muted-foreground">
            Describe your situation or drop a photo. LifeCart builds a budgeted list from real store prices, pays through PayPal when you confirm, and watches prices and due dates for you.
          </p>
          <ul className="flex flex-col gap-3 text-[15px]">
            {[
              [Sparkles, "A complete plan with real prices and 90-day price history"],
              [ShieldCheck, "Nothing is paid without your approval, always through PayPal"],
              [BellRing, "One WhatsApp message when a watched price really drops"],
              [CalendarClock, "Rent, utilities and top-ups in one place, with reminders"],
            ].map(([Icon, text]) => {
              const I = Icon as typeof Sparkles;
              return (
                <li key={text as string} className="flex items-center gap-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-primary">
                    <I className="size-[18px]" aria-hidden />
                  </span>
                  {text as string}
                </li>
              );
            })}
          </ul>
        </section>
        <div className="w-full max-w-md justify-self-center lg:justify-self-end">
          <SignInForm />
        </div>
      </main>
      <Footer />
    </div>
  );
}

async function RecentPlans({ userId }: { userId: string }) {
  const plans = await listPlans(userId, 4);
  if (!plans.length) return null;
  return (
    <section aria-labelledby="recent" className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <h2 id="recent" className="flex-1 text-[22px] font-bold">
          Your plans
        </h2>
        <Link href="/plans" className="text-sm font-semibold">
          See all
        </Link>
      </div>
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

/** Signed in: start a plan, what's coming up, your plans. */
function Dashboard({ user }: { user: User }) {
  const first = user.name.split(/\s+/)[0];
  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader active="home" />
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-4 pb-12 pt-10 sm:px-6">
        <section className="flex flex-col items-center gap-3 text-center">
          <span className="text-[13px] font-semibold uppercase tracking-wide text-primary">{first ? `Hi ${first}` : "Welcome back"}</span>
          <h1 className="max-w-[760px] text-[clamp(30px,4.4vw,46px)] font-extrabold leading-[1.1] tracking-[-0.03em]">What&apos;s changing in your life?</h1>
          <p className="max-w-[600px] text-muted-foreground">Describe it or drop a photo. We&apos;ll build a priced plan you can pay for with PayPal.</p>
        </section>

        <GoalForm defaultBudget={num(user.monthlyBudget)} />

        <ComingUp userId={user.id} />
        <RecentPlans userId={user.id} />

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
      <Footer />
    </div>
  );
}

async function HomeGate() {
  const user = await getSessionUser();
  if (!user) return <Landing />;
  if (!user.onboardedAt) redirect("/welcome");
  return <Dashboard user={user} />;
}

export default function Home() {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <HomeGate />
    </Suspense>
  );
}
