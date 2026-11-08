"use client";

import { useActionState } from "react";
import { ArrowRight, Loader2, Mail } from "lucide-react";
import { signInStep, type SignInState } from "@/app/auth-actions";

export function SignInForm() {
  const [state, action, pending] = useActionState<SignInState, FormData>(signInStep, { step: "email" });
  const codeStep = state?.step === "code";

  return (
    <form action={action} aria-label="Sign in" className="flex w-full flex-col gap-4 rounded-[20px] border border-border bg-card p-6 shadow-[0_1px_2px_rgba(14,23,38,0.04),0_12px_32px_rgba(14,23,38,0.06)]">
      {!codeStep ? (
        <>
          <div className="flex flex-col gap-1">
            <h2 className="text-xl font-bold">Sign in or create an account</h2>
            <p className="text-sm text-muted-foreground">We&apos;ll email you a 6-digit code. No password needed.</p>
          </div>
          <label htmlFor="email" className="text-sm font-semibold">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            defaultValue={state?.email ?? ""}
            placeholder="you@example.com"
            className="min-h-12 rounded-xl border border-input bg-[#FBFCFD] px-4 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          />
          <button type="submit" name="intent" value="send" disabled={pending} className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary font-semibold text-primary-foreground disabled:opacity-70">
            {pending ? <Loader2 className="size-[18px] animate-spin" aria-hidden /> : <Mail className="size-[18px]" aria-hidden />}
            {pending ? "Sending…" : "Email me a code"}
          </button>
        </>
      ) : (
        <>
          <div className="flex flex-col gap-1">
            <h2 className="text-xl font-bold">Check your email</h2>
            <p className="text-sm text-muted-foreground">
              We sent a 6-digit code to <strong className="text-foreground">{state?.email}</strong>. It expires in 10 minutes.
            </p>
          </div>
          <input type="hidden" name="email" value={state?.email ?? ""} />
          <label htmlFor="code" className="text-sm font-semibold">
            Code
          </label>
          <input
            id="code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9 ]{6,7}"
            maxLength={7}
            required
            autoFocus
            placeholder="123 456"
            className="tabular min-h-12 rounded-xl border border-input bg-[#FBFCFD] px-4 text-center text-2xl font-bold tracking-[0.3em] outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          />
          <button type="submit" name="intent" value="verify" disabled={pending} className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary font-semibold text-primary-foreground disabled:opacity-70">
            {pending ? <Loader2 className="size-[18px] animate-spin" aria-hidden /> : null}
            {pending ? "Checking…" : "Continue"}
            {!pending && <ArrowRight className="size-[18px]" aria-hidden />}
          </button>
          <div className="flex flex-wrap justify-between gap-2 text-sm">
            <button type="submit" name="intent" value="change" formNoValidate className="font-semibold text-primary">
              Use a different email
            </button>
            <button type="submit" name="intent" value="resend" formNoValidate className="font-semibold text-primary">
              Send a new code
            </button>
          </div>
        </>
      )}
      {state?.info && !state.error && <p className="text-sm text-success">{state.info}</p>}
      {state?.error && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {state.error}
        </p>
      )}
    </form>
  );
}
