"use client";

import { useRouter } from "next/navigation";
import { removePlan } from "@/app/actions";
import { DeleteButton } from "@/components/confirm-dialog";

/** Delete a plan (asks first). `goTo` navigates after deleting; otherwise the list refreshes in place. */
export function DeletePlanButton({ goalId, title, goTo, text }: { goalId: string; title: string; goTo?: string; text?: string }) {
  const router = useRouter();
  return (
    <DeleteButton
      label={`Delete plan ${title}`}
      text={text}
      className={
        text
          ? "flex min-h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-muted-foreground hover:border-destructive/40 hover:text-destructive"
          : undefined
      }
      title={`Delete "${title}"?`}
      confirmLabel="OK, delete plan"
      body={
        <>
          <span>Its items, offers and price watches are removed. This can&apos;t be undone.</span>
          <span>Payments you already made stay on your Money page.</span>
        </>
      }
      onConfirm={async () => {
        const res = await removePlan(goalId);
        if (res.error) return res;
        if (goTo) router.push(goTo);
        else router.refresh();
        return res;
      }}
    />
  );
}
