"use client";

import { useActionState } from "react";
import { CheckCircle2, ExternalLink, Loader2, MessageCircle } from "lucide-react";
import { phoneStep, type PhoneState } from "@/app/auth-actions";

/**
 * WhatsApp alerts: 1) join LifeCart's WhatsApp (Twilio sandbox opt-in), 2) verify your number with a code sent there.
 * Alerts only ever go to your own verified number.
 */
export function WhatsAppSetup({
  verified,
  joinPhrase,
  joinUrl,
  sandboxNumber,
  optional,
}: {
  verified: string | null;
  joinPhrase: string | null;
  joinUrl: string | null;
  sandboxNumber: string;
  /** Welcome screen: say clearly that this can be skipped. */
  optional?: boolean;
}) {
  const [state, action, pending] = useActionState<PhoneState, FormData>(phoneStep, verified ? { step: "done", masked: verified } : { step: "number" });
  const step = state?.step ?? "number";
  const field = "min-h-11 rounded-[10px] border border-input bg-[#FBFCFD] px-3.5 text-[15px] outline-none focus-visible:ring-2 focus-visible:ring-ring/40";

  const joinBox = (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-background p-4">
      <span className="text-sm font-semibold">{step === "done" ? "If alerts stop arriving" : "1. Join LifeCart on WhatsApp"}</span>
      <span className="text-[13px] text-muted-foreground">
        {step === "done" ? "The free WhatsApp sandbox forgets you after about 3 days without messages. Send the join message again and alerts resume." : "Open WhatsApp and send the join message. It lets LifeCart message you (WhatsApp test sandbox)."}
      </span>
      <div className="flex flex-wrap items-center gap-3">
        {joinUrl && (
          <a href={joinUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center gap-2 rounded-[10px] bg-[#25D366] px-4 text-sm font-semibold text-[#073B22] no-underline">
            <MessageCircle className="size-4" aria-hidden /> Open WhatsApp <ExternalLink className="size-3.5" aria-hidden />
          </a>
        )}
        {joinPhrase && (
          <span className="text-[13px] text-muted-foreground">
            or send <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground">{joinPhrase}</code> to <span className="tabular whitespace-nowrap">{sandboxNumber}</span>
          </span>
        )}
      </div>
    </div>
  );

  return (
    <section aria-labelledby="wa" className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-6">
      <div className="flex flex-col gap-1">
        <h2 id="wa" className="text-lg font-semibold">
          WhatsApp alerts
          {optional && <span className="ml-2 rounded-full bg-muted px-2 py-0.5 align-middle text-xs font-semibold text-muted-foreground">Optional</span>}
        </h2>
        <p className="text-sm text-muted-foreground">
          Price drops, bills due and receipts, sent only to your own number, with a link back here to pay with PayPal.
          {optional && " You can skip this and add it any time in your profile; everything else works without it."}
        </p>
      </div>

      {step === "done" ? (
        <>
          <div role="status" className="flex flex-wrap items-center gap-3 rounded-xl bg-success-soft px-4 py-3 text-[#0B4F31]">
            <CheckCircle2 className="size-5" aria-hidden />
            <span className="flex-1 text-sm">
              Alerts go to <strong className="tabular">{state?.masked}</strong> · verified
            </span>
            <form action={action} className="flex gap-2">
              <button type="submit" name="intent" value="change" className="min-h-9 rounded-lg border border-success/40 bg-card px-3 text-[13px] font-semibold text-foreground">
                Change number
              </button>
              <button type="submit" name="intent" value="remove" className="min-h-9 rounded-lg px-3 text-[13px] font-semibold text-muted-foreground hover:text-destructive">
                Remove
              </button>
            </form>
          </div>
          {joinBox}
        </>
      ) : (
        <>
          {joinBox}
          <form action={action} className="flex flex-col gap-2 rounded-xl border border-border bg-background p-4">
            <span className="text-sm font-semibold">2. Verify your number</span>
            {step === "number" ? (
              <>
                <label htmlFor="wa-phone" className="text-[13px] text-muted-foreground">
                  Your WhatsApp number, with country code. We&apos;ll send a 6-digit code to it on WhatsApp.
                </label>
                <div className="flex flex-wrap gap-2">
                  <input id="wa-phone" name="phone" type="tel" autoComplete="tel" required placeholder="+1 415 555 0142" className={`${field} min-w-56 flex-1`} />
                  <button type="submit" name="intent" value="send" disabled={pending} className="flex min-h-11 items-center gap-2 rounded-[10px] bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-70">
                    {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
                    {pending ? "Sending…" : "Send code"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <label htmlFor="wa-code" className="text-[13px] text-muted-foreground">
                  Enter the code we sent to <strong className="tabular text-foreground">{state?.masked}</strong> on WhatsApp.
                </label>
                <div className="flex flex-wrap gap-2">
                  <input
                    id="wa-code"
                    name="code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={7}
                    autoFocus
                    required
                    placeholder="123 456"
                    className={`${field} tabular w-40 text-center text-lg font-bold tracking-[0.25em]`}
                  />
                  <button type="submit" name="intent" value="verify" disabled={pending} className="flex min-h-11 items-center gap-2 rounded-[10px] bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-70">
                    {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
                    Verify
                  </button>
                </div>
                <div className="flex gap-4 text-[13px]">
                  <button type="submit" name="intent" value="change" formNoValidate className="font-semibold text-primary">
                    Use a different number
                  </button>
                </div>
              </>
            )}
          </form>
        </>
      )}
      {state?.info && !state.error && <p className="text-sm text-success">{state.info}</p>}
      {state?.error && (
        <p role="alert" className="rounded-lg bg-warning-soft px-3 py-2 text-sm text-[#5C3800]">
          {state.error}
        </p>
      )}
    </section>
  );
}
