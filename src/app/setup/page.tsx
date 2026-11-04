import { Suspense } from "react";
import { connection } from "next/server";
import { integrations } from "@/lib/env";

async function StatusList() {
  await connection(); // read env at request time, not build time
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
            {i.live ? "Live" : "Mock"}
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
    </main>
  );
}
