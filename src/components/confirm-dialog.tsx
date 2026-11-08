"use client";

import { useState, useTransition, type ReactNode } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Result = { ok?: boolean; error?: string } | void;

/** Controlled "are you sure?" pop-up: Cancel, OK, and an optional extra choice (e.g. "Move to price watch"). */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  body,
  confirmLabel = "OK",
  onConfirm,
  extra,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  body: ReactNode;
  confirmLabel?: string;
  onConfirm: () => Promise<Result>;
  extra?: { label: string; onClick: () => Promise<Result> };
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<Result>) =>
    start(async () => {
      setError(null);
      const res = await fn();
      if (res && res.error) setError(res.error);
      else onOpenChange(false);
    });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!pending) {
          setError(null);
          onOpenChange(o);
        }
      }}
    >
      <DialogContent className="gap-5 p-5 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">{title}</DialogTitle>
          <DialogDescription render={<div />} className="flex flex-col gap-2 text-sm text-muted-foreground">
            {body}
          </DialogDescription>
        </DialogHeader>
        {error && (
          <p role="alert" className="rounded-lg bg-warning-soft px-3 py-2 text-sm text-[#5C3800]">
            {error}
          </p>
        )}
        <DialogFooter className="-mx-5 -mb-5 p-4">
          <button type="button" disabled={pending} onClick={() => onOpenChange(false)} className="min-h-10 rounded-[10px] border border-border bg-card px-4 text-sm font-semibold">
            Cancel
          </button>
          {extra && (
            <button type="button" disabled={pending} onClick={() => run(extra.onClick)} className="min-h-10 rounded-[10px] border border-[#C98A1E] bg-card px-4 text-sm font-semibold text-warning">
              {extra.label}
            </button>
          )}
          <button
            type="button"
            disabled={pending}
            onClick={() => run(onConfirm)}
            className="flex min-h-10 items-center justify-center gap-2 rounded-[10px] bg-destructive px-4 text-sm font-semibold text-white disabled:opacity-70"
          >
            {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {confirmLabel}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** A trash-can button that asks first. */
export function DeleteButton({
  label,
  title,
  body,
  confirmLabel = "Delete",
  onConfirm,
  className,
  text,
}: {
  label: string;
  title: string;
  body: ReactNode;
  confirmLabel?: string;
  onConfirm: () => Promise<Result>;
  className?: string;
  text?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-label={label}
        title={label}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        className={
          className ??
          "flex size-9 shrink-0 items-center justify-center gap-1.5 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        }
      >
        <Trash2 className="size-4" aria-hidden />
        {text && <span className="text-sm font-semibold">{text}</span>}
      </button>
      <ConfirmDialog open={open} onOpenChange={setOpen} title={title} body={body} confirmLabel={confirmLabel} onConfirm={onConfirm} />
    </>
  );
}
