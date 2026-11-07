"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, ExternalLink, Loader2, MessageCircle } from "lucide-react";
import { sendForApproval, type SendApprovalState } from "@/app/actions";

/** The "Send to WhatsApp" button plus a phone-style preview of exactly what was sent. */
export function SendApproval({ goalId, phone }: { goalId: string; phone: string | null }) {
  const [state, setState] = useState<SendApprovalState>(undefined);
  const [pending, start] = useTransition();

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        disabled={pending}
        onClick={() => start(async () => setState(await sendForApproval(goalId)))}
        className="flex min-h-[52px] items-center justify-center gap-2 rounded-xl bg-white px-3 text-[15px] font-bold text-ink disabled:opacity-70"
      >
        {pending ? <Loader2 className="size-5 shrink-0 animate-spin" aria-hidden /> : <MessageCircle className="size-5 shrink-0" aria-hidden />}
        {state && "link" in state ? "Send a new link" : "Approve on WhatsApp"}
      </button>

      {state && "error" in state && (
        <p role="alert" className="rounded-lg bg-[#3A1C14] px-3 py-2 text-sm text-[#FFD6CC]">
          {state.error}
        </p>
      )}

      {state && "link" in state && (
        <div className="flex flex-col gap-3" aria-live="polite">
          <p className="flex items-center gap-2 text-sm text-[#C3CAD6]">
            {state.sent ? (
              <>
                <CheckCircle2 className="size-4 text-[#9CE3BF]" aria-hidden /> Sent to WhatsApp {phone}
              </>
            ) : (
              <>Not sent: {state.reason}. Here&apos;s the message and link.</>
            )}
          </p>
          <div className="rounded-2xl bg-[#E9EDF2] p-3 text-ink">
            <div className="max-w-[92%] whitespace-pre-wrap rounded-2xl rounded-bl-sm bg-white px-3 py-2.5 text-[13px] leading-relaxed shadow-sm">
              {state.message.replace(/\*/g, "")}
            </div>
          </div>
          <a href={state.link} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-sm font-semibold text-white">
            Open the approval page here <ExternalLink className="size-3.5" aria-hidden />
          </a>
          <span className="text-xs text-[#C3CAD6]">The link works once and expires in 30 minutes.</span>
        </div>
      )}
    </div>
  );
}
