import Link from "next/link";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth/session";
import { ChevronRight } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { listPlans } from "@/lib/plans";

async function PlanList() {
  const user = await requireUser();
  const plans = await listPlans(user.id, 50);
  if (!plans.length)
    return (
      <p className="text-muted-foreground">
        No plans yet. <Link href="/">Start one</Link>.
      </p>
    );
  return (
    <ul className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-card">
      {plans.map((p) => (
        <li key={p.id}>
          <Link href={`/plans/${p.id}`} className="flex items-center gap-3 px-5 py-4 text-foreground no-underline hover:bg-background">
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="font-semibold">{p.title ?? "Plan in progress"}</span>
              <span className="truncate text-sm text-muted-foreground">{p.prompt}</span>
            </span>
            <span className="text-xs text-muted-foreground">{p.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
            <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default function PlansPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader active="plans" />
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 pb-12 pt-8 sm:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="flex-1 text-[34px] font-extrabold">Plans</h1>
          <Link href="/" className="rounded-xl bg-primary px-5 py-2.5 font-semibold text-primary-foreground no-underline">
            New plan
          </Link>
        </div>
        <Suspense fallback={<div className="h-48 animate-pulse rounded-2xl bg-muted" />}>
          <PlanList />
        </Suspense>
      </main>
    </div>
  );
}
