"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, RotateCcw } from "lucide-react";

type Step = { text: string; source?: string };

const WAITING = [
  "Reading your situation…",
  "Drafting what you'll actually need…",
  "Searching real store listings…",
  "Checking price history…",
];

export function PlanRunner({ goalId, prompt }: { goalId: string; prompt: string }) {
  const router = useRouter();
  const [steps, setSteps] = useState<Step[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const started = useRef(false);

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 2500);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      try {
        const res = await fetch(`/api/plans/${goalId}/run`, { method: "POST" });
        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            const e = JSON.parse(line);
            if (e.type === "step") setSteps((s) => [...s, { text: e.text, source: e.source }]);
            if (e.type === "error") setError(e.message);
            if (e.type === "done") router.refresh();
          }
        }
      } catch {
        setError("Lost the connection to the planner. Please try again.");
      }
    })();
  }, [goalId, router]);

  return (
    <section aria-live="polite" className="mx-auto flex w-full max-w-2xl flex-col gap-5 rounded-2xl border border-border bg-card p-6 sm:p-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-extrabold">Planning…</h1>
        <p className="text-sm text-muted-foreground">&ldquo;{prompt}&rdquo;</p>
      </div>
      <ol className="flex flex-col gap-3">
        {steps.map((s, i) => (
          <li key={i} className="flex items-start gap-3 text-sm">
            <span className="mt-0.5 flex size-[22px] shrink-0 items-center justify-center rounded-full bg-success-soft text-success">
              <Check className="size-3" strokeWidth={3} aria-hidden />
            </span>
            <span>
              {s.text} {s.source && <span className="text-muted-foreground">{s.source}</span>}
            </span>
          </li>
        ))}
        {!error && (
          <li className="flex items-center gap-3 text-sm text-muted-foreground">
            <Loader2 className="size-[22px] animate-spin text-primary" aria-hidden />
            {WAITING[Math.min(steps.length, WAITING.length - 1)] ?? WAITING[tick % WAITING.length]}
          </li>
        )}
      </ol>
      {error && (
        <div role="alert" className="flex flex-col gap-3 rounded-xl bg-warning-soft p-4 text-sm text-[#5C3800]">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => location.reload()}
            className="flex min-h-10 items-center gap-2 self-start rounded-lg border border-[#C98A1E] bg-card px-3 font-semibold"
          >
            <RotateCcw className="size-4" aria-hidden /> Try again
          </button>
        </div>
      )}
    </section>
  );
}
