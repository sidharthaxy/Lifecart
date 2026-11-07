"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { runWatchCheck, type WatchCheckState } from "@/app/actions";

/** "Check prices now" for all watched items. */
export function CheckPricesButton() {
  const [state, setState] = useState<WatchCheckState>(undefined);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setState(await runWatchCheck());
            router.refresh();
          })
        }
        className="flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 font-semibold text-primary-foreground disabled:opacity-60"
      >
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <RefreshCw className="size-4" aria-hidden />}
        {pending ? "Checking live prices…" : "Check prices now"}
      </button>
      <Result state={state} />
    </div>
  );
}

/** Demo-only: pretend this item dropped just below its target, to show the alert -> WhatsApp -> PayPal flow. */
export function SimulateDropButton({ itemId }: { itemId: string }) {
  const [state, setState] = useState<WatchCheckState>(undefined);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setState(await runWatchCheck(itemId));
            router.refresh();
          })
        }
        className="min-h-9 self-start rounded-lg border border-dashed border-[#B9C3D3] px-3 text-[13px] font-medium text-muted-foreground hover:text-foreground disabled:opacity-60"
      >
        {pending ? "Simulating…" : "Demo: simulate a price drop"}
      </button>
      <Result state={state} />
    </div>
  );
}

function Result({ state }: { state: WatchCheckState }) {
  if (!state) return null;
  return (
    <div role="status" className="flex max-w-md flex-col gap-1 text-right text-[13px] text-muted-foreground">
      <span>{state.message}</span>
      {state.link && (
        <a href={state.link} target="_blank" rel="noreferrer" className="flex items-center justify-end gap-1 font-semibold">
          Open the buy link <ExternalLink className="size-3" aria-hidden />
        </a>
      )}
    </div>
  );
}
