"use client";

import { useState, useTransition } from "react";
import { Loader2, Pencil } from "lucide-react";
import { updateWatchTarget } from "@/app/actions";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { money } from "@/lib/format";

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * A watched item's target price, as a button. Clicking opens a small editor with today's price, the 90-day low
 * and quick picks. `onSaved` lets the caller update its own state (the plan table) or refresh (Orders page).
 */
export function TargetEditor({
  itemId,
  name,
  target,
  today,
  low90,
  onSaved,
  className,
}: {
  itemId: string;
  name: string;
  target: number | null;
  today: number | null;
  low90?: number | null;
  onSaved?: (target: number) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(target != null ? target.toFixed(2) : "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const picks: { label: string; value: number }[] = [];
  if (today) {
    if (low90 && low90 < today * 0.995) picks.push({ label: `90-day low ${money(low90)}`, value: round(low90) });
    picks.push({ label: `10% off ${money(round(today * 0.9))}`, value: round(today * 0.9) });
    picks.push({ label: `20% off ${money(round(today * 0.8))}`, value: round(today * 0.8) });
  }

  const save = () =>
    start(async () => {
      setError(null);
      const n = Number(value.replace(/[^0-9.]/g, ""));
      if (!Number.isFinite(n) || n <= 0) return setError("Enter a price, like 25 or 24.99.");
      const res = await updateWatchTarget(itemId, n);
      if (res.error || res.targetPrice == null) return setError(res.error ?? "Couldn't save the target.");
      onSaved?.(res.targetPrice);
      setOpen(false);
    });

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation(); // don't open the item drawer
          setValue(target != null ? target.toFixed(2) : "");
          setError(null);
          setOpen(true);
        }}
        aria-label={`Change the target price for ${name}`}
        title="Change target price"
        className={className ?? "tabular inline-flex items-center gap-1 rounded text-xs text-warning underline decoration-dotted underline-offset-2 hover:text-[#7A4A00]"}
      >
        Target {money(target)} <Pencil className="size-3" aria-hidden />
      </button>
      <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
        <DialogContent className="gap-4 p-5 sm:max-w-sm" onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">Target price</DialogTitle>
            <DialogDescription>
              We&apos;ll message you when {name} drops to this price or lower. Nothing is bought without you.
            </DialogDescription>
          </DialogHeader>
          <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-sm">
            <dt className="text-muted-foreground">Today&apos;s price</dt>
            <dd className="tabular text-right font-semibold">{money(today)}</dd>
            {low90 ? (
              <>
                <dt className="text-muted-foreground">Lowest in 90 days</dt>
                <dd className="tabular text-right font-semibold">{money(low90)}</dd>
              </>
            ) : null}
          </dl>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
            className="flex flex-col gap-2"
          >
            <label htmlFor={`target-${itemId}`} className="text-sm font-semibold">
              Your target
            </label>
            <span className="flex min-h-11 items-center gap-1.5 rounded-[10px] border border-input bg-[#FBFCFD] px-3 focus-within:ring-2 focus-within:ring-ring/40">
              <span className="text-muted-foreground">$</span>
              <input
                id={`target-${itemId}`}
                inputMode="decimal"
                autoFocus
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="tabular w-full bg-transparent text-base font-semibold outline-none"
              />
            </span>
            {picks.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {picks.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => setValue(p.value.toFixed(2))}
                    className="min-h-8 rounded-full border border-border px-3 text-xs font-semibold hover:border-primary"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            )}
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </form>
          <DialogFooter className="-mx-5 -mb-5 p-4">
            <button type="button" disabled={pending} onClick={() => setOpen(false)} className="min-h-10 rounded-[10px] border border-border bg-card px-4 text-sm font-semibold">
              Cancel
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={save}
              className="flex min-h-10 items-center justify-center gap-2 rounded-[10px] bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-70"
            >
              {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
              Save target
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
