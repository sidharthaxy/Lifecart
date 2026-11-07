"use client";

import { ExternalLink } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { money } from "@/lib/format";
import type { ItemView, OfferView } from "@/lib/totals";
import { IndependentBadge, PayPill, priceVerdict } from "./bits";

function PriceChart({ points }: { points: { at: string; price: number }[] }) {
  if (points.length < 2) return <p className="text-sm text-muted-foreground">No price history for this listing yet.</p>;
  const W = 440, H = 150, L = 44, B = 22, T = 10;
  const ps = points.map((p) => p.price);
  const min = Math.min(...ps), max = Math.max(...ps);
  const lo = Math.floor(min * 0.97), hi = Math.ceil(max * 1.03);
  const y = (p: number) => T + (1 - (p - lo) / (hi - lo || 1)) * (H - T - B);
  const x = (i: number) => L + (i / (points.length - 1)) * (W - L - 6);
  const d = points.map((p, i) => `${x(i).toFixed(1)},${y(p.price).toFixed(1)}`).join(" ");
  const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const last = points[points.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Price from ${money(points[0].price)} to ${money(last.price)} over ${points.length} days; low ${money(min)}, high ${money(max)}.`}>
      {[hi, (hi + lo) / 2, lo].map((v) => (
        <g key={v}>
          <line x1={L} x2={W} y1={y(v)} y2={y(v)} stroke="var(--border)" />
          <text x={0} y={y(v) + 4} fontSize="11" fill="var(--muted-foreground)">
            ${Math.round(v)}
          </text>
        </g>
      ))}
      <polyline points={d} fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(points.length - 1)} cy={y(last.price)} r="4.5" fill="var(--success)" />
      <text x={L} y={H - 4} fontSize="11" fill="var(--muted-foreground)">{fmt(points[0].at)}</text>
      <text x={W - 34} y={H - 4} fontSize="11" fill="var(--muted-foreground)">Today</text>
    </svg>
  );
}

function OfferRow({ o, chosen, onUse }: { o: OfferView; chosen: boolean; onUse?: () => void }) {
  return (
    <div className={chosen ? "flex items-center gap-3 rounded-xl border border-primary bg-[#FAFBFF] p-3" : "flex items-center gap-3 rounded-xl border border-border p-3"}>
      {o.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={o.imageUrl} alt="" className="size-12 shrink-0 rounded-lg border border-border bg-white object-contain" />
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm font-semibold">{o.title}</span>
        <span className="flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
          {o.merchant} {o.independent && o.source !== "estimate" && <IndependentBadge />}
        </span>
      </div>
      <div className="flex flex-col items-end gap-1">
        <span className="tabular font-semibold">{money(o.price)}</span>
        {chosen ? (
          <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground">Chosen</span>
        ) : onUse ? (
          <button type="button" onClick={onUse} className="min-h-8 rounded-md border border-border px-2 text-xs font-semibold hover:border-primary">
            Use this
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function ItemSheet({ item, onClose, onUse }: { item: ItemView | null; onClose: () => void; onUse: (offerId: string) => void }) {
  const v = priceVerdict(item?.offer ?? null);
  const s = item?.offer?.stats;
  return (
    <Sheet open={Boolean(item)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-[520px]">
        {item && (
          <>
            <SheetHeader className="border-b border-border">
              <span className="text-[13px] font-semibold text-primary">{item.category}</span>
              <SheetTitle className="text-xl font-bold">{item.name}</SheetTitle>
              <SheetDescription className="sr-only">Offers and price history for {item.name}</SheetDescription>
              <div className="flex flex-wrap gap-2 pt-1">
                <PayPill type={item.payType} />
                {item.payType === "watch" && item.targetPrice && (
                  <span className="rounded-full bg-muted px-2.5 py-1 text-xs">Target {money(item.targetPrice)}</span>
                )}
              </div>
            </SheetHeader>

            <div className="flex flex-col gap-5 p-4">
              <div className="rounded-xl bg-accent px-3.5 py-3 text-sm text-[#1B2A63]">
                <strong>Why it&apos;s here:</strong> {item.reason}
              </div>

              <section className="flex flex-col gap-2">
                <h3 className="text-[15px] font-semibold">{item.alternatives.length ? `${item.alternatives.length + 1} offers compared` : "Price"}</h3>
                {item.offer && <OfferRow o={item.offer} chosen />}
                {item.alternatives.map((o) => (
                  <OfferRow key={o.id} o={o} chosen={false} onUse={() => onUse(o.id)} />
                ))}
                {item.offer?.source === "estimate" && (
                  <p className="text-[13px] text-muted-foreground">
                    {item.kind === "service" ? "Services are booked locally and billed by PayPal invoice. This is a typical US price." : "We couldn't find an exact store listing, so this is a typical price."}
                  </p>
                )}
              </section>

              {item.offer?.source === "channel3" && (
                <section className="flex flex-col gap-2.5">
                  <h3 className="text-[15px] font-semibold">Price history at {item.offer.merchant}</h3>
                  <figure className="m-0 rounded-xl border border-border p-3.5 pb-2.5">
                    <PriceChart points={item.history} />
                    {s && (
                      <figcaption className="flex flex-wrap gap-x-4 gap-y-1 pt-1.5 text-[13px] text-muted-foreground">
                        <span>Low {money(s.min)}</span>
                        <span>High {money(s.max)}</span>
                        <span>Average {money(s.mean)}</span>
                      </figcaption>
                    )}
                  </figure>
                  {v && (
                    <span className={v.tone === "good" ? "text-sm font-semibold text-success" : v.tone === "bad" ? "text-sm font-semibold text-warning" : "text-sm font-semibold text-muted-foreground"}>
                      {v.label}
                      {item.payType === "watch" ? ". We'll message you when it hits your target." : v.tone === "bad" ? ". Consider waiting." : ""}
                    </span>
                  )}
                </section>
              )}

              {item.offer?.url && (
                <a href={item.offer.url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-sm font-semibold">
                  View listing at {item.offer.merchant} <ExternalLink className="size-3.5" aria-hidden />
                </a>
              )}
              <p className="text-xs text-muted-foreground">Offers and price history via Channel3.</p>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
