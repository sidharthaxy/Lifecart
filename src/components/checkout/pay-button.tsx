"use client";

import { useActionState } from "react";
import { Loader2, Lock } from "lucide-react";
import { payNow, type PayState } from "@/app/actions";

/** "Pay with PayPal": freezes the amounts server-side and redirects straight to PayPal. */
export function PayButton({ goalId, disabled }: { goalId: string; disabled?: boolean }) {
  const [state, action, pending] = useActionState<PayState, FormData>(() => payNow(goalId), undefined);
  return (
    <form action={action} className="flex flex-col gap-2.5">
      <button
        type="submit"
        disabled={pending || disabled}
        className="flex min-h-[52px] items-center justify-center gap-2 rounded-xl bg-white px-3 text-[15px] font-bold text-ink disabled:opacity-60"
      >
        {pending ? <Loader2 className="size-5 shrink-0 animate-spin" aria-hidden /> : <Lock className="size-[18px] shrink-0" aria-hidden />}
        {pending ? "Opening PayPal…" : "Pay with PayPal"}
      </button>
      {state?.error && (
        <p role="alert" className="rounded-lg bg-[#3A1C14] px-3 py-2 text-sm text-[#FFD6CC]">
          {state.error}
        </p>
      )}
      <span className="text-center text-xs text-[#C3CAD6]">You&apos;ll confirm on PayPal (sandbox). Nothing is charged before that.</span>
    </form>
  );
}
