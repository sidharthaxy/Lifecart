"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BellRing, ExternalLink, Loader2, Lock, Pencil, Plus } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { periodError, periodLabel } from "@/lib/bill-period";
import { DeleteButton } from "@/components/confirm-dialog";
import { removeBill } from "@/app/actions";
import { addBillAction, addSampleBillsAction, payBillsNow, sendBillReminders, switchPhonePlan, updateBillAction, type AddBillState, type PayState } from "@/app/actions";
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

const today = () => new Date().toISOString().slice(0, 10);
const plusMonth = (d: string) => {
  const x = new Date(`${d}T12:00:00Z`);
  x.setUTCMonth(x.getUTCMonth() + 1);
  return x.toISOString().slice(0, 10);
};
const asDate = (d: string) => new Date(`${d}T12:00:00Z`);

export type BillFormValues = { name: string; payee: string; type: string; amount: string; periodStart: string; dueDate: string };

/**
 * The bill fields, shared by "Add a bill" and "Edit". The current billing period is picked as a start and end
 * date (the end is the due date); the period length is worked out and shown as you pick.
 */
function BillFields({ initial }: { initial?: BillFormValues }) {
  const [start, setStart] = useState(initial?.periodStart ?? today());
  const [end, setEnd] = useState(initial?.dueDate ?? plusMonth(today()));
  const err = start && end ? periodError(asDate(start), asDate(end)) : null;
  const field = "min-h-11 rounded-[10px] border border-input bg-[#FBFCFD] px-3 outline-none focus-visible:ring-2 focus-visible:ring-ring/40";
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Bill</span>
          <input name="name" required defaultValue={initial?.name} placeholder="e.g. Gym membership" className={field} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Pay to</span>
          <input name="payee" required defaultValue={initial?.payee} placeholder="e.g. FitClub" className={field} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Type</span>
          <select name="type" className={field} defaultValue={initial?.type ?? "other"}>
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
          <input name="amount" required inputMode="decimal" defaultValue={initial?.amount} placeholder="49.99" className={field} />
        </label>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Current period starts</span>
          <input name="periodStart" type="date" required value={start} onChange={(e) => setStart(e.target.value)} className={field} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Ends (due date)</span>
          <input name="dueDate" type="date" required value={end} min={start || undefined} onChange={(e) => setEnd(e.target.value)} className={field} />
        </label>
        <p className={cn("min-h-11 rounded-[10px] px-3 py-2.5 text-sm", err ? "bg-warning-soft text-[#5C3800]" : "bg-accent text-foreground")} aria-live="polite">
          {err ?? (
            <>
              Billed every <strong>{periodLabel(asDate(start), asDate(end))}</strong>. After you pay, the next period starts {asDate(end).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}.
            </>
          )}
        </p>
      </div>
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
  return (
    <form action={action} className="flex w-full flex-col gap-3 rounded-2xl border border-border bg-card p-5" aria-label="Add a bill">
      <BillFields />
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

/** Pencil button on a bill: edit amount, billing period, name, payee or type in a pop-up. */
export function EditBillButton({ id, values }: { id: string; values: BillFormValues }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<AddBillState, FormData>(async (prev, fd) => {
    const r = await updateBillAction(id, prev, fd);
    if (r?.ok) setOpen(false);
    return r;
  }, undefined);
  return (
    <>
      <button
        type="button"
        aria-label={`Edit ${values.name}`}
        title="Edit bill"
        onClick={() => setOpen(true)}
        className="flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-primary"
      >
        <Pencil className="size-4" aria-hidden />
      </button>
      <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
        <DialogContent className="gap-4 p-5 sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">Edit {values.name}</DialogTitle>
            <DialogDescription>Change the amount, the billing period or who you pay. Payments you already made don&apos;t change.</DialogDescription>
          </DialogHeader>
          <form action={action} className="flex flex-col gap-3" aria-label={`Edit ${values.name}`}>
            {open && <BillFields initial={values} />}
            {state?.error && (
              <p role="alert" className="text-sm text-destructive">
                {state.error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} disabled={pending} className="min-h-10 rounded-[10px] border border-border px-4 text-sm font-semibold">
                Cancel
              </button>
              <button type="submit" disabled={pending} className="flex min-h-10 items-center gap-2 rounded-[10px] bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60">
                {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
                Save changes
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
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

/** Delete a bill (asks first). */
export function DeleteBillButton({ id, name }: { id: string; name: string }) {
  return (
    <DeleteButton
      label={`Delete ${name}`}
      title={`Delete ${name}?`}
      confirmLabel="OK, delete bill"
      body={
        <>
          <span>We&apos;ll stop tracking it and stop sending reminders for it.</span>
          <span>Payments you already made stay on your Money page.</span>
        </>
      }
      onConfirm={() => removeBill(id)}
    />
  );
}
