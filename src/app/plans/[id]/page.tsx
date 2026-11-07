import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Check } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { PlanRunner } from "@/components/plan/plan-runner";
import { PlanWorkspace } from "@/components/plan/plan-workspace";
import { getPlan } from "@/lib/plans";

async function PlanContent({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await connection(); // plans change per request; never prerender them
  const { id } = await params;
  const sp = await searchParams;
  const itemParam = typeof sp.item === "string" ? sp.item : null;
  const plan = await getPlan(id).catch(() => null);
  if (!plan) notFound();
  const { goal, items } = plan;

  if (goal.status !== "ready") return <PlanRunner goalId={goal.id} prompt={goal.prompt} />;

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <Link href="/" className="text-sm font-medium no-underline">
          ← New plan
        </Link>
        <div className="flex flex-wrap items-start gap-4">
          {goal.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={goal.imageUrl} alt="Your photo" className="size-16 rounded-xl border border-border object-cover" />
          )}
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <h1 className="text-[34px] font-extrabold leading-tight">{goal.title}</h1>
            {goal.summary && <p className="max-w-3xl text-muted-foreground">{goal.summary}</p>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {(goal.context ?? []).map((c) => (
            <span key={c} className="rounded-full border border-border bg-card px-3 py-1.5 text-[13px] text-[#2A3446]">
              {c}
            </span>
          ))}
        </div>
      </section>

      {goal.steps?.length ? (
        <section aria-labelledby="agent" className="flex flex-col gap-3.5 rounded-2xl border border-border bg-card px-6 py-5">
          <h2 id="agent" className="text-base font-semibold">
            What the agent did
          </h2>
          <ol className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-x-6 gap-y-2.5">
            {goal.steps.map((s, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm text-[#2A3446]">
                <span className="mt-px flex size-[22px] shrink-0 items-center justify-center rounded-full bg-success-soft text-success">
                  <Check className="size-3" strokeWidth={3} aria-hidden />
                </span>
                <span>
                  {s.text} {s.source && <span className="text-muted-foreground">{s.source}</span>}
                </span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <PlanWorkspace goalId={goal.id} initialItems={items} budget={goal.budgetCap} initialSelected={itemParam} />
    </div>
  );
}

export default function PlanPage(props: PageProps<"/plans/[id]">) {
  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader active="plans" />
      <main className="mx-auto w-full max-w-7xl px-4 pb-12 pt-8 sm:px-6">
        <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-muted" />}>
          <PlanContent params={props.params} searchParams={props.searchParams} />
        </Suspense>
      </main>
    </div>
  );
}
