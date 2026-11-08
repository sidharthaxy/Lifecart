import { Suspense } from "react";
import { requireUser } from "@/lib/auth/session";
import { integrations } from "@/lib/env";
import { DAILY_CAPS, usageToday } from "@/lib/usage";

async function StatusList() {
  await requireUser(); // signed-in only; also makes this read env at request time
  const list = integrations();
  return (
    <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
      {list.map((i) => (
        <li key={i.key} className="flex flex-wrap items-start gap-3 px-5 py-4">
          <span
            className={
              i.live
                ? "rounded-full bg-success-soft px-2.5 py-0.5 text-xs font-semibold text-success"
                : "rounded-full bg-warning-soft px-2.5 py-0.5 text-xs font-semibold text-warning"
            }
          >
            {i.live ? "Live" : i.key === "db" ? "Local" : "Mock"}
          </span>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="font-semibold">{i.name}</span>
            {!i.live && (
              <span className="text-sm text-muted-foreground">
                {i.mockNote} Add <code className="font-mono text-xs">{i.missing.join(", ")}</code> to .env.local.
              </span>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

async function UsageList() {
  await requireUser();
  const rows = await usageToday();
  const providers = Object.keys(DAILY_CAPS) as (keyof typeof DAILY_CAPS)[];
  return (
    <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
      {providers.map((p) => {
        const row = rows.find((r) => r.provider === p);
        const cap = DAILY_CAPS[p];
        const used = cap.units != null ? (row?.units ?? 0) : (row?.calls ?? 0);
        const limit = cap.units ?? cap.calls ?? 1;
        const pct = Math.min(100, Math.round((used / limit) * 100));
        const groqLeft = p === "groq" ? row?.meta?.["remaining-requests"] : undefined;
        return (
          <li key={p} className="flex flex-col gap-2 px-5 py-4">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="font-semibold capitalize">{p}</span>
              <span className="text-sm text-muted-foreground">{cap.label}</span>
              <span className="tabular ml-auto text-sm font-semibold">
                {used.toLocaleString()} / {limit.toLocaleString()} today
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${pct}% of today's safety cap used`}>
              <div className={pct > 85 ? "h-full bg-destructive" : pct > 60 ? "h-full bg-[#C98A1E]" : "h-full bg-primary"} style={{ width: `${pct}%` }} />
            </div>
            {groqLeft != null && (
              <span className="text-xs text-muted-foreground">
                Groq reports {String(groqLeft)} requests left today for {String(row?.meta?.model ?? "the last model used")}; {String(row?.meta?.["remaining-tokens-this-minute"] ?? "?")} tokens left this minute.
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export default function SetupPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-12">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-extrabold">LifeCart setup</h1>
        <p className="text-muted-foreground">
          Paste keys into <code className="font-mono text-sm">.env.local</code>, then restart <code className="font-mono text-sm">npm run dev</code>. Anything still marked Mock keeps working with demo data.
        </p>
      </div>
      <Suspense fallback={<div className="h-80 animate-pulse rounded-2xl bg-muted" />}>
        <StatusList />
      </Suspense>
      <div className="flex flex-col gap-1 pt-4">
        <h2 className="text-xl font-bold">API usage today</h2>
        <p className="text-sm text-muted-foreground">
          Safety caps sit below each free tier&apos;s real limit. Near a cap, LifeCart pauses AI planning or falls back to price estimates instead of failing. Resets at midnight UTC.
        </p>
      </div>
      <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-muted" />}>
        <UsageList />
      </Suspense>
    </main>
  );
}
