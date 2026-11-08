"use client";

import { useState, useTransition } from "react";
import { Check, Copy, ExternalLink, Loader2, TicketPercent } from "lucide-react";
import { findCouponsAction } from "@/app/actions";
import type { StoreCoupons } from "@/lib/coupons";

function CodeChip({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(code);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // clipboard blocked: the code is still visible
        }
      }}
      className="flex items-center gap-1.5 rounded-md border border-dashed border-primary/50 bg-accent px-2 py-0.5 font-mono text-[13px] font-semibold text-primary"
      aria-label={`Copy code ${code}`}
    >
      {code}
      {copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
    </button>
  );
}

/** "Find coupons": searches the web for this plan's stores, only when pressed. */
export function CouponFinder({ goalId, initial }: { goalId: string; initial: StoreCoupons[] }) {
  const [stores, setStores] = useState<StoreCoupons[]>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const search = () =>
    start(async () => {
      setError(null);
      const res = await findCouponsAction(goalId);
      if (!res || res.error) setError(res?.error ?? "Something went wrong.");
      else setStores(res.stores ?? []);
    });

  const total = stores.reduce((a, s) => a + s.offers.length, 0);
  return (
    <section aria-labelledby="coupons" className="flex flex-col gap-3.5 rounded-2xl border border-border bg-card p-6">
      <div className="flex items-center gap-2">
        <TicketPercent className="size-[18px] text-primary" aria-hidden />
        <h2 id="coupons" className="flex-1 text-base font-semibold">
          Coupons
        </h2>
      </div>
      <p className="text-[13px] text-muted-foreground">
        We search the web for promo codes and deals for the stores in this plan. It runs only when you press the button and takes about 30 seconds.
      </p>
      <button
        type="button"
        onClick={search}
        disabled={pending}
        className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-primary bg-card font-semibold text-primary hover:bg-accent disabled:opacity-70"
      >
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <TicketPercent className="size-4" aria-hidden />}
        {pending ? "Searching the web…" : stores.length ? "Search again" : "Find coupons"}
      </button>
      {error && (
        <p role="alert" className="rounded-lg bg-warning-soft px-3 py-2 text-[13px] text-[#5C3800]">
          {error}
        </p>
      )}

      {stores.length > 0 && (
        <div className="flex flex-col gap-4" aria-live="polite">
          {stores.map((s) => (
            <div key={s.domain} className="flex flex-col gap-2">
              <span className="text-sm font-semibold">
                {s.merchant}
                {s.merchant.toLowerCase() !== s.domain && <span className="font-normal text-muted-foreground"> · {s.domain}</span>}
              </span>
              {!s.offers.length ? (
                <span className="text-[13px] text-muted-foreground">{s.note ?? "No current offers found."}</span>
              ) : (
                <ul className="flex flex-col gap-2">
                  {s.offers.slice(0, 5).map((o) => (
                    <li key={o.id} className="flex flex-col gap-1 rounded-xl border border-[#EEF1F5] p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        {o.discountText && <span className="rounded-full bg-success-soft px-2 py-0.5 text-xs font-semibold text-[#0B4F31]">{o.discountText}</span>}
                        {o.code ? <CodeChip code={o.code} /> : <span className="text-xs text-muted-foreground">Code shown at the source</span>}
                      </div>
                      <span className="text-[13px]">{o.title}</span>
                      <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                        {o.expires && <span>Expires {o.expires}</span>}
                        {o.terms && <span>{o.terms}</span>}
                        {o.sourceUrl && (
                          <a href={o.sourceUrl} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 font-semibold">
                            {o.sourceName ?? "Source"} <ExternalLink className="size-3" aria-hidden />
                          </a>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
          <p className="text-xs text-muted-foreground">
            {total ? "Found on the web and not tested by LifeCart. Use a code when you order from the store; LifeCart checkout doesn't apply codes yet." : ""}
            {stores[0]?.checkedAt ? ` Checked ${new Date(stores[0].checkedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}.` : ""}
          </p>
        </div>
      )}
    </section>
  );
}
