"use client";

import { useActionState, useRef, useState } from "react";
import { ArrowRight, Camera, Loader2, X } from "lucide-react";
import { createGoal, type GoalFormState } from "@/app/actions";

const EXAMPLES = [
  "Moving into my first studio apartment next month, budget is tight.",
  "Starting to work from home full time.",
  "Our first baby is due in March.",
  "I'm out 9 AM to 7 PM on weekdays and getting a golden retriever puppy.",
];

/** Shrink photos in the browser so uploads stay small and fit the vision model limits. */
async function toSmallDataUrl(file: File): Promise<string> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1024 / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.82);
}

export function GoalForm({ defaultBudget }: { defaultBudget?: number | null }) {
  const [state, action, pending] = useActionState<GoalFormState, FormData>(createGoal, undefined);
  const [prompt, setPrompt] = useState("");
  const [photo, setPhoto] = useState<string>("");
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <form
      action={action}
      aria-label="Start a plan"
      className="mx-auto flex w-full max-w-3xl flex-col gap-4 rounded-[20px] border border-border bg-card p-5 shadow-[0_1px_2px_rgba(14,23,38,0.04),0_12px_32px_rgba(14,23,38,0.06)] sm:p-6"
    >
      <label htmlFor="goal" className="text-sm font-semibold">
        What&apos;s happening in your life?
      </label>
      <textarea
        id="goal"
        name="prompt"
        rows={3}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="For example: I'm starting to work from home and need a proper desk setup."
        className="w-full resize-y rounded-xl border border-input bg-[#FBFCFD] px-4 py-3.5 text-[17px] leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      />
      <input type="hidden" name="photo" value={photo} />

      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="sr-only"
          id="photo-file"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) setPhoto(await toSmallDataUrl(f));
          }}
        />
        {photo ? (
          <span className="flex min-h-11 items-center gap-2 rounded-[10px] border border-input bg-card py-1 pl-1 pr-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo} alt="Your photo" className="size-9 rounded-md object-cover" />
            <span className="text-sm">Photo added</span>
            <button type="button" aria-label="Remove photo" onClick={() => setPhoto("")} className="rounded p-1 text-muted-foreground hover:text-foreground">
              <X className="size-4" />
            </button>
          </span>
        ) : (
          <label
            htmlFor="photo-file"
            className="flex min-h-11 cursor-pointer items-center gap-2 rounded-[10px] border border-dashed border-[#B9C3D3] bg-card px-4 text-sm font-medium text-[#2A3446]"
          >
            <Camera className="size-[18px]" aria-hidden /> Add a photo
          </label>
        )}
        <div className="flex min-h-11 items-center gap-2 rounded-[10px] border border-input bg-card px-3">
          <label htmlFor="budget" className="text-sm text-muted-foreground">
            Shopping budget
          </label>
          <span className="text-muted-foreground">$</span>
          <input id="budget" name="budget" inputMode="decimal" defaultValue={defaultBudget ? defaultBudget.toLocaleString("en-US") : ""} placeholder="800" className="w-20 bg-transparent font-semibold outline-none" />
        </div>
        <span className="flex-1" />
        <button
          type="submit"
          disabled={pending}
          className="flex min-h-12 items-center gap-2 rounded-xl bg-primary px-6 text-base font-semibold text-primary-foreground disabled:opacity-70"
        >
          {pending ? <Loader2 className="size-[18px] animate-spin" aria-hidden /> : null}
          {pending ? "Starting…" : "Plan it"}
          {!pending && <ArrowRight className="size-[18px]" aria-hidden />}
        </button>
      </div>

      {state?.error && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {state.error}
        </p>
      )}

      <div className="flex flex-wrap gap-2 border-t border-[#EEF1F5] pt-1">
        <span className="pr-1 pt-2.5 text-[13px] text-muted-foreground">Try:</span>
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            type="button"
            onClick={() => setPrompt(ex)}
            className="mt-2 min-h-9 rounded-full border border-[#DDE3EC] bg-background px-3.5 text-sm text-[#2A3446] hover:border-primary/40"
          >
            {ex.length > 40 ? ex.slice(0, 38) + "…" : ex}
          </button>
        ))}
      </div>
    </form>
  );
}
