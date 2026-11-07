"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Loader2, MessageCircleQuestion, RotateCcw } from "lucide-react";
import type { ClarifyQuestion } from "@/db/schema";
import { cn } from "@/lib/utils";

type Step = { text: string; source?: string };
type Phase = "asking" | "questions" | "running";

const WAITING = ["Reading your situation…", "Drafting what you'll actually need…", "Searching real store listings…", "Checking price history…"];

export function PlanRunner({
  goalId,
  prompt,
  questions: initialQuestions,
  answered,
  running,
}: {
  goalId: string;
  prompt: string;
  questions: ClarifyQuestion[] | null;
  answered: boolean;
  running: boolean;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>(running || answered ? "running" : initialQuestions?.length ? "questions" : "asking");
  const [questions, setQuestions] = useState<ClarifyQuestion[]>(initialQuestions ?? []);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [other, setOther] = useState<Record<string, string>>({});
  const [steps, setSteps] = useState<Step[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [answerError, setAnswerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const started = useRef<Phase | null>(null);

  const run = useCallback(async () => {
    // Give up if the server goes silent for 2 minutes (it sends steps or pings well before that).
    const ctrl = new AbortController();
    let silence: ReturnType<typeof setTimeout> = setTimeout(() => ctrl.abort(), 120_000);
    const heard = () => {
      clearTimeout(silence);
      silence = setTimeout(() => ctrl.abort(), 120_000);
    };
    try {
      const res = await fetch(`/api/plans/${goalId}/run`, { method: "POST", signal: ctrl.signal });
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        heard();
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
      setError(ctrl.signal.aborted ? "The planner stopped responding. Please try again." : "Lost the connection to the planner. Please try again.");
    } finally {
      clearTimeout(silence);
    }
  }, [goalId, router]);

  const ask = useCallback(async () => {
    try {
      const res = await fetch(`/api/plans/${goalId}/questions`, { method: "POST" });
      const body = (await res.json()) as { questions?: ClarifyQuestion[]; blocked?: string };
      if (body.blocked) {
        setError(body.blocked);
        setBlocked(true);
        return;
      }
      const qs = body.questions;
      if (qs?.length) {
        setQuestions(qs);
        setPhase("questions");
      } else setPhase("running");
    } catch {
      setPhase("running"); // questions are optional; never block planning on them
    }
  }, [goalId]);

  // Kick off network work from a timer; cleanup cancels it, so React's dev double-mount runs it once.
  useEffect(() => {
    if (phase === "questions" || started.current === phase) return;
    const t = setTimeout(() => {
      started.current = phase;
      void (phase === "running" ? run() : ask());
    }, 0);
    return () => clearTimeout(t);
  }, [phase, run, ask]);

  const submit = async (skip: boolean) => {
    const merged: Record<string, string> = {};
    if (!skip) for (const q of questions) {
      const v = answers[q.id] === "__other" ? other[q.id] : answers[q.id];
      if (v?.trim()) merged[q.id] = v.trim();
    }
    setSaving(true);
    setAnswerError(null);
    try {
      const res = await fetch(`/api/plans/${goalId}/questions`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ answers: merged }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setAnswerError(body.error ?? "Those answers couldn't be used. Try different wording.");
        return;
      }
      setPhase("running");
    } finally {
      setSaving(false);
    }
  };

  if (phase === "questions") {
    const answeredCount = questions.filter((q) => (answers[q.id] === "__other" ? other[q.id]?.trim() : answers[q.id])).length;
    return (
      <section className="mx-auto flex w-full max-w-2xl flex-col gap-6 rounded-2xl border border-border bg-card p-6 sm:p-8">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-primary">
            <MessageCircleQuestion className="size-5" aria-hidden />
          </span>
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-extrabold">A few quick questions</h1>
            <p className="text-sm text-muted-foreground">
              So the plan fits you, not a generic list. &ldquo;{prompt.length > 120 ? prompt.slice(0, 118) + "…" : prompt}&rdquo;
            </p>
          </div>
        </div>

        {questions.map((q) => (
          <fieldset key={q.id} className="flex flex-col gap-2.5 border-0 p-0">
            <legend className="mb-1 font-semibold">{q.question}</legend>
            {q.why && <span className="-mt-1.5 text-[13px] text-muted-foreground">{q.why}</span>}
            <div className="flex flex-wrap gap-2">
              {[...q.options, "__other"].map((opt) => {
                const on = answers[q.id] === opt;
                return (
                  <button
                    key={opt}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setAnswers((a) => ({ ...a, [q.id]: opt }))}
                    className={cn(
                      "min-h-10 rounded-full border px-4 text-sm",
                      on ? "border-primary bg-accent font-semibold text-primary" : "border-[#DDE3EC] bg-background text-[#2A3446] hover:border-primary/40",
                    )}
                  >
                    {opt === "__other" ? "Other…" : opt}
                  </button>
                );
              })}
            </div>
            {answers[q.id] === "__other" && (
              <input
                autoFocus
                aria-label={`Your answer: ${q.question}`}
                value={other[q.id] ?? ""}
                onChange={(e) => setOther((o) => ({ ...o, [q.id]: e.target.value }))}
                placeholder="Type your answer"
                className="min-h-11 rounded-[10px] border border-input bg-[#FBFCFD] px-3.5 outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              />
            )}
          </fieldset>
        ))}

        {answerError && (
          <p role="alert" className="rounded-xl bg-warning-soft px-4 py-3 text-sm text-[#5C3800]">
            {answerError}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-5">
          <button
            type="button"
            onClick={() => submit(false)}
            disabled={answeredCount === 0 || saving}
            className="flex min-h-12 items-center gap-2 rounded-xl bg-primary px-6 font-semibold text-primary-foreground disabled:opacity-50"
          >
            Plan it <ArrowRight className="size-[18px]" aria-hidden />
          </button>
          <button type="button" onClick={() => submit(true)} className="min-h-12 rounded-xl px-4 font-semibold text-muted-foreground hover:text-foreground">
            Skip, just plan it
          </button>
          <span className="ml-auto text-[13px] text-muted-foreground">
            {answeredCount} of {questions.length} answered
          </span>
        </div>
      </section>
    );
  }

  return (
    <section aria-live="polite" className="mx-auto flex w-full max-w-2xl flex-col gap-5 rounded-2xl border border-border bg-card p-6 sm:p-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-extrabold">{phase === "asking" ? "Reading your situation…" : "Planning…"}</h1>
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
            {phase === "asking" ? "Checking if I need to ask you anything…" : WAITING[Math.min(steps.length, WAITING.length - 1)]}
          </li>
        )}
      </ol>
      {error && (
        <div role="alert" className="flex flex-col gap-3 rounded-xl bg-warning-soft p-4 text-sm text-[#5C3800]">
          <span>{error}</span>
          {blocked ? (
            <Link href="/" className="self-start font-semibold">
              Start a different plan
            </Link>
          ) : (
            <button type="button" onClick={() => location.reload()} className="flex min-h-10 items-center gap-2 self-start rounded-lg border border-[#C98A1E] bg-card px-3 font-semibold">
              <RotateCcw className="size-4" aria-hidden /> Try again
            </button>
          )}
        </div>
      )}
    </section>
  );
}
