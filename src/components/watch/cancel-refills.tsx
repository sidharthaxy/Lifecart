"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelRefillsAction } from "@/app/actions";

/** Two-step cancel: first click asks for confirmation, second click cancels at PayPal. */
export function CancelRefillsButton({ paymentId }: { paymentId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="flex flex-col items-end gap-1">
      {confirming ? (
        <div className="flex gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await cancelRefillsAction(paymentId);
                if (res.error) setError(res.error);
                setConfirming(false);
                router.refresh();
              })
            }
            className="min-h-9 rounded-lg bg-destructive px-3 text-[13px] font-semibold text-white disabled:opacity-60"
          >
            {pending ? "Cancelling…" : "Yes, cancel refills"}
          </button>
          <button type="button" onClick={() => setConfirming(false)} className="min-h-9 rounded-lg px-3 text-[13px] font-semibold text-muted-foreground">
            Keep
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => setConfirming(true)} className="min-h-9 rounded-lg border border-border px-3 text-[13px] font-semibold text-destructive hover:border-destructive">
          Cancel refills
        </button>
      )}
      {error && (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      )}
    </div>
  );
}
