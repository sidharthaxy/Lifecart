import { cn } from "@/lib/utils";
import type { ItemView, OfferView } from "@/lib/totals";

export const PAY_LABEL: Record<ItemView["payType"], string> = {
  order: "Order",
  subscription: "Subscription",
  invoice: "Invoice",
  watch: "Watching",
};

export function PayPill({ type, className }: { type: ItemView["payType"]; className?: string }) {
  const tone = {
    order: "bg-accent text-primary",
    subscription: "bg-sub-soft text-sub",
    invoice: "bg-smb-soft text-smb",
    watch: "bg-warning-soft text-warning",
  }[type];
  return <span className={cn("inline-block rounded-full px-2.5 py-1 text-xs font-semibold", tone, className)}>{PAY_LABEL[type]}</span>;
}

export function IndependentBadge() {
  return <span className="inline-block rounded-full bg-smb-soft px-2 py-0.5 text-[11px] font-semibold text-smb">Independent store</span>;
}

/** Human label for where today's price sits in its 90-day range. */
export function priceVerdict(o: OfferView | null): { label: string; tone: "good" | "neutral" | "bad" } | null {
  if (!o || o.source !== "channel3") return null;
  const s = o.stats;
  if (s?.min != null && s?.max != null && s.max - s.min <= s.max * 0.02) return { label: "Stable price", tone: "neutral" };
  if (s?.min != null && o.price <= s.min * 1.01) return { label: "Lowest in 90 days", tone: "good" };
  if (s?.max != null && s?.mean != null && o.price > s.mean * 1.08) return { label: "Above its usual price", tone: "bad" };
  const st = (o.priceStatus ?? "").toLowerCase();
  if (st.includes("low") || st.includes("good")) return { label: "Good price", tone: "good" };
  if (st.includes("high")) return { label: "Above its usual price", tone: "bad" };
  if (st) return { label: "Typical price", tone: "neutral" };
  return null;
}

export function Sparkline({ points, width = 96, height = 24, label }: { points: { price: number }[]; width?: number; height?: number; label: string }) {
  if (points.length < 2) return <span className="text-xs text-muted-foreground">No history yet</span>;
  const ps = points.map((p) => p.price);
  const min = Math.min(...ps);
  const max = Math.max(...ps);
  const span = max - min || 1;
  const d = ps.map((p, i) => `${((i / (ps.length - 1)) * width).toFixed(1)},${(2 + (1 - (p - min) / span) * (height - 4)).toFixed(1)}`).join(" ");
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
      <polyline points={d} fill="none" stroke="var(--primary)" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
