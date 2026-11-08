"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BellRing, ExternalLink, Loader2, Lock, Plus } from "lucide-react";
import { addBillAction, addSampleBillsAction, payBillsNow, sendBillReminders, switchPhonePlan, type AddBillState, type PayState } from "@/app/actions";
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Pay one or more bills: freezes the amounts server-side and goes straight to PayPal. */
export function PayBillsButton({ ids, label, primary }: { ids: string[]; label: string; primary?: boolean }) {
  const [state, action, pending] = useActionState<PayState, FormData>(() => payBillsNow(ids), undefined);
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <button
        type="submit"
        disabled={pending || !ids.length}
        className={cn(
          "flex min-h-10 items-center justify-center gap-1.5 rounded-[10px] px-3.5 text-sm font-semibold disabled:opacity-50",
          primary ? "bg-primary text-primary-foreground" : "border border-[#DDE3EC] bg-card text-foreground hover:border-primary",
        )}
      >
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : primary ? <Lock className="size-4" aria-hidden /> : null}
        {pending ? "Opening PayPal…" : label}
      </button>
      {state?.error && (
        <span role="alert" className="text-xs text-destructive">
          {state.error}
        </span>
      )}
    </form>
  );
}

/** Phone top-up plan picker; switching updates the bill amount (insight action uses it too). */
export function PlanPicker({ billId, options, current }: { billId: string; options: { price: number; label: string }[]; current: number }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <fieldset className="m-0 border-0 p-0" disabled={pending}>
      <legend className="mb-2 p-0 text-sm text-muted-foreground">Plan</legend>
      <div className="grid grid-cols-3 gap-2">
        {options.map((o) => {
          const on = o.price === current;
          return (
            <button
              key={o.price}
              type="button"
              aria-pressed={on}
              onClick={() =>
                !on &&
                start(async () => {
                  await switchPhonePlan(billId, o.price);
                  router.refresh();
                })
              }
              className={cn(
                "flex min-h-16 flex-col items-center justify-center rounded-xl text-sm",
                on ? "border-2 border-primary bg-accent" : "border border-[#DDE3EC] bg-card hover:border-primary/40",
              )}
            >
              <span className="tabular font-bold">{money(o.price)}</span>
              <span className={on ? "text-xs text-primary" : "text-xs text-muted-foreground"}>{o.label}</span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export function SwitchPlanButton({ billId, price, label }: { billId: string; price: number; label: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await switchPhonePlan(billId, price);
          router.refresh();
        })
      }
      className="min-h-9 self-start rounded-lg border border-success/40 bg-card px-3 text-[13px] font-semibold text-success disabled:opacity-60"
    >
      {pending ? "Switching…" : label}
    </button>
  );
}

/** Manual trigger for the due-date WhatsApp digest (the scheduler calls the same thing daily). */
export function RemindButton() {
  const [res, setRes] = useState<{ message: string; link?: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => start(async () => setRes(await sendBillReminders()))}
        className="flex min-h-10 items-center gap-2 self-start rounded-[10px] border border-[#DDE3EC] bg-card px-3.5 text-sm font-semibold hover:border-primary disabled:opacity-60"
      >
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <BellRing className="size-4" aria-hidden />}
        {pending ? "Sending…" : "Send due-date reminder now"}
      </button>
      {res && (
        <p role="status" className="text-[13px] text-muted-foreground">
          {res.message}{" "}
          {res.link && (
            <a href={res.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold">
              Open the pay link <ExternalLink className="size-3" aria-hidden />
            </a>
          )}
        </p>
      )}
    </div>
  );
}

export function AddBillForm() {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<AddBillState, FormData>(async (prev, fd) => {
    const r = await addBillAction(prev, fd);
    if (r?.ok) setOpen(false);
    return r;
  }, undefined);
  if (!open)
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-11 items-center gap-2 rounded-[10px] border border-primary bg-card px-4 font-semibold text-primary"
      >
        <Plus className="size-[18px]" aria-hidden /> Add a bill
      </button>
    );
  const field = "min-h-11 rounded-[10px] border border-input bg-[#FBFCFD] px-3 outline-none focus-visible:ring-2 focus-visible:ring-ring/40";
  return (
    <form action={action} className="flex w-full flex-col gap-3 rounded-2xl border border-border bg-card p-5" aria-label="Add a bill">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Bill</span>
          <input name="name" required placeholder="e.g. Gym membership" className={field} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Pay to</span>
          <input name="payee" required placeholder="e.g. FitClub" className={field} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Type</span>
          <select name="type" className={field} defaultValue="other">
            <option value="rent">Rent</option>
            <option value="electricity">Electricity</option>
            <option value="water">Water</option>
            <option value="internet">Internet</option>
            <option value="phone">Phone</option>
            <option value="subscription">Subscription</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Amount ($)</span>
          <input name="amount" required inputMode="decimal" placeholder="49.99" className={field} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Next due date</span>
          <input name="dueDate" type="date" required className={field} />
        </label>
      </div>
      {state?.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="min-h-11 rounded-[10px] bg-primary px-4 font-semibold text-primary-foreground disabled:opacity-60">
          {pending ? "Saving…" : "Save bill"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="min-h-11 rounded-[10px] px-4 font-semibold text-muted-foreground">
          Cancel
        </button>
      </div>
    </form>
  );
}

/** Demo tools: add a realistic set of sample bills (once). */
export function SampleBillsButton() {
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => start(async () => setMsg((await addSampleBillsAction()).message))}
        className="flex min-h-10 items-center gap-2 self-start rounded-[10px] border border-dashed border-[#B9C3D3] bg-card px-3.5 text-sm font-semibold hover:border-primary disabled:opacity-60"
      >
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
        Add sample bills (demo)
      </button>
      {msg && (
        <p role="status" className="text-[13px] text-muted-foreground">
          {msg}
        </p>
      )}
    </div>
  );
}
