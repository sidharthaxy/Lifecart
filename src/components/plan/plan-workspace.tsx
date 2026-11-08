"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import { BellRing, CheckCircle2, Search } from "lucide-react";
import { moveToWatch, removePlanItem, selectOffer } from "@/app/actions";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { money } from "@/lib/format";
import { computeTotals, type ItemView } from "@/lib/totals";
import { ItemSheet } from "./item-sheet";
import { PlanGrid } from "./plan-grid";

export function PlanWorkspace({
  goalId,
  initialItems,
  budget,
  initialSelected,
  extra,
}: {
  goalId: string;
  initialItems: ItemView[];
  budget: number | null;
  initialSelected?: string | null;
  /** Shown under "How you'll pay" (the coupon finder). */
  extra?: ReactNode;
}) {
  const [items, setItems] = useState(initialItems);
  const [selected, setSelected] = useState<string | null>(
    initialSelected ?? null,
  );
  const [cap, setCap] = useState(budget ?? 1000);
  const [filter, setFilter] = useState("");
  const [, startTransition] = useTransition();
  const totals = useMemo(() => computeTotals(items), [items]);
  const item = items.find((i) => i.id === selected) ?? null;
  const diff = cap - totals.firstMonth;

  // Biggest optional purchases to suggest when over budget.
  const suggestion = useMemo(() => {
    if (diff >= 0) return null;
    // Only things you could still move: unbought products paid as one-time orders. Prefer "can wait" items, biggest first.
    const open = items.filter((i) => !i.purchased && i.kind !== "service" && i.payType === "order");
    const byPrice = (xs: ItemView[]) => [...xs].sort((a, b) => (b.offer?.price ?? b.estimatedPrice ?? 0) - (a.offer?.price ?? a.estimatedPrice ?? 0));
    const pick = byPrice(open.filter((i) => i.priority !== "now"))[0] ?? byPrice(open)[0];
    return pick
      ? {
          id: pick.id,
          name: pick.name,
          saves: (pick.offer?.price ?? pick.estimatedPrice ?? 0) * pick.qty,
        }
      : null;
  }, [diff, items]);

  const useOffer = (offerId: string) => {
    if (!item) return;
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== item.id) return it;
        const all = [it.offer!, ...it.alternatives];
        const next = all.find((o) => o.id === offerId)!;
        return {
          ...it,
          offer: next,
          alternatives: all.filter((o) => o.id !== offerId),
          history: next.productId === it.offer?.productId ? it.history : [],
        };
      }),
    );
    startTransition(() => selectOffer(item.id, offerId));
  };

  const [busy, setBusy] = useState<string | null>(null);
  const watch = async (id: string, on: boolean) => {
    setBusy(id);
    try {
      const res = await moveToWatch(id, on);
      if ("error" in res) return;
      setItems((prev) =>
        prev.map((it) =>
          it.id === id
            ? {
                ...it,
                payType: res.payType,
                targetPrice: res.targetPrice,
                priority: on ? "can_wait" : "now",
              }
            : it,
        ),
      );
    } finally {
      setBusy(null);
    }
  };

  const setTarget = (id: string, target: number) => setItems((prev) => prev.map((it) => (it.id === id ? { ...it, targetPrice: target } : it)));

  // Remove an item: ask first, and offer price watch as the gentler option for products.
  const [toDelete, setToDelete] = useState<string | null>(null);
  const deleting = items.find((i) => i.id === toDelete) ?? null;
  const removeItem = async () => {
    if (!deleting) return;
    const res = await removePlanItem(deleting.id);
    if (res.error) return res;
    setItems((prev) => prev.filter((i) => i.id !== deleting.id));
    if (selected === deleting.id) setSelected(null);
    return res;
  };

  const r = totals.rails;
  // What's left: items to pay now, items waiting on a price drop, and what's already bought.
  const toPay = items.filter((i) => !i.purchased && i.payType !== "watch");
  const watching = items.filter((i) => !i.purchased && i.payType === "watch");
  const bought = items.filter((i) => i.purchased);
  const allPaid = bought.length > 0 && toPay.length === 0;
  return (
    <div className="flex flex-wrap items-start gap-6">
      <section
        aria-labelledby="list"
        className="min-w-0 flex-[999_1_640px] overflow-hidden rounded-2xl border border-border bg-card"
      >
        <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-4 sm:px-6">
          <h2 id="list" className="flex-1 text-base font-semibold">
            Shopping list · {items.length} items
          </h2>
          <label className="flex min-h-9 items-center gap-2 rounded-lg border border-border px-2.5 text-sm">
            <Search className="size-4 text-muted-foreground" aria-hidden />
            <span className="sr-only">Filter items</span>
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter"
              className="w-28 bg-transparent outline-none"
            />
          </label>
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[860px]">
            <PlanGrid
              items={items}
              onSelect={setSelected}
              onWatch={watch}
              onDelete={setToDelete}
              onTarget={setTarget}
              busy={busy}
              quickFilter={filter}
            />
          </div>
        </div>
        <p className="border-t border-border px-6 py-3 text-xs text-muted-foreground">
          Click a row to compare offers and price history. Watch takes an item
          out of today&apos;s total until its price drops.
        </p>
      </section>

      <aside
        aria-label="Budget summary"
        className="flex flex-[1_1_320px] flex-col gap-4"
      >
        {allPaid ? (
          <section
            role="status"
            className="flex flex-col gap-4 rounded-2xl border border-success/30 bg-card p-6"
          >
            <span className="flex size-12 items-center justify-center rounded-full bg-success-soft text-success">
              <CheckCircle2 className="size-7" aria-hidden />
            </span>
            <div className="flex flex-col gap-1">
              <h2 className="text-xl font-bold">
                All paid. Thanks for shopping with us!
              </h2>
              <p className="text-sm text-muted-foreground">
                You paid {money(totals.paid)} with PayPal for {bought.length}{" "}
                item{bought.length === 1 ? "" : "s"} in this plan.
              </p>
            </div>
            {watching.length > 0 && (
              <div className="flex gap-2.5 rounded-xl bg-warning-soft p-3.5 text-sm text-[#5C3800]">
                <BellRing className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>
                  <strong>
                    Still watching {watching.length} item
                    {watching.length === 1 ? "" : "s"} ({money(totals.watching)}
                    ).
                  </strong>{" "}
                  We&apos;ll message you on WhatsApp when one drops to your
                  target. Nothing is charged until you press Buy now.
                </span>
              </div>
            )}
            <ul className="flex flex-col gap-2 border-t border-[#EEF1F5] pt-3.5 text-sm">
              <li>
                <a href="/orders" className="font-semibold">
                  See your receipts and refills
                </a>{" "}
                <span className="text-muted-foreground">
                  in Orders &amp; watch
                </span>
              </li>
              <li>
                <a href="/money" className="font-semibold">
                  See what you spent and saved
                </a>{" "}
                <span className="text-muted-foreground">on Money</span>
              </li>
            </ul>
            <span className="text-xs text-muted-foreground">
              We&apos;ll message you only when something needs you: a price drop
              you&apos;re waiting for, or a refill about to renew.
            </span>
          </section>
        ) : (
          <>
            <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-6">
              <h2 className="text-base font-semibold" suppressHydrationWarning>
                {new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
              </h2>
              <div className="flex flex-col">
                <span className="tabular font-heading text-[40px] font-extrabold tracking-tight">
                  {money(totals.firstMonth)}
                </span>
                <span
                  className={
                    diff >= 0
                      ? "text-sm font-semibold text-success"
                      : "text-sm font-semibold text-destructive"
                  }
                >
                  {diff >= 0
                    ? `${money(diff)} under your cap`
                    : `${money(-diff)} over your cap`}
                </span>
              </div>
              <div className="flex flex-col gap-2">
                <div className="flex justify-between text-sm">
                  <label htmlFor="cap" className="text-muted-foreground">
                    Budget cap
                  </label>
                  <span className="tabular font-semibold">{money(cap)}</span>
                </div>
                <input
                  id="cap"
                  type="range"
                  min={200}
                  max={3000}
                  step={50}
                  value={cap}
                  onChange={(e) => setCap(Number(e.target.value))}
                  className="w-full accent-primary"
                />
              </div>
              <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-2.5 border-t border-[#EEF1F5] pt-3.5 text-sm">
                {totals.paid > 0 && (
                  <>
                    <dt className="text-success">Already paid</dt>
                    <dd className="tabular text-right font-semibold text-success">
                      {money(totals.paid)}
                    </dd>
                  </>
                )}
                <dt className="text-muted-foreground">Buy now</dt>
                <dd className="tabular text-right font-semibold">
                  {money(totals.buyNow)}
                </dd>
                <dt className="text-muted-foreground">Monthly after that</dt>
                <dd className="tabular text-right font-semibold">
                  {money(totals.monthly)}
                </dd>
                <dt className="text-muted-foreground">Watching for a drop</dt>
                <dd className="tabular text-right font-semibold">
                  {money(totals.watching)}
                </dd>
                {totals.belowList > 0 && (
                  <>
                    <dt className="text-success">Below list price</dt>
                    <dd className="tabular text-right font-semibold text-success">
                      −{money(totals.belowList)}
                    </dd>
                  </>
                )}
              </dl>
              {suggestion && (
                <div className="flex flex-col gap-2 rounded-xl bg-warning-soft p-3.5 text-sm text-[#5C3800]">
                  <span>
                    <strong>Suggestion:</strong> move the{" "}
                    {suggestion.name.toLowerCase()} to price watch to save{" "}
                    {money(suggestion.saves)} this month.
                  </span>
                  <button
                    type="button"
                    onClick={() => watch(suggestion.id, true)}
                    className="min-h-9 self-start rounded-lg border border-[#C98A1E] bg-card px-3 text-[13px] font-semibold"
                  >
                    Apply suggestion
                  </button>
                </div>
              )}
            </section>

            <section className="flex flex-col gap-3.5 rounded-2xl border border-border bg-card p-6">
              <h2 className="text-base font-semibold">How you&apos;ll pay</h2>
              <div className="flex flex-col gap-3 text-sm">
                <Rail
                  color="bg-primary"
                  label={`${r.orders.count} PayPal Order items`}
                  sub={`${r.orders.stores} stores`}
                  value={money(r.orders.total)}
                />
                <Rail
                  color="bg-sub"
                  label={`${r.subscriptions.count} Subscriptions`}
                  sub="refills"
                  value={`${money(r.subscriptions.total)}/mo`}
                />
                <Rail
                  color="bg-smb"
                  label={`${r.invoices.count} Invoices`}
                  sub="local services"
                  value={
                    [
                      r.invoices.once ? money(r.invoices.once) : null,
                      r.invoices.monthly
                        ? `${money(r.invoices.monthly)}/mo`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" + ") || money(0)
                  }
                />
                <Rail
                  color="bg-[#C98A1E]"
                  label="Price watch"
                  sub={`${r.watch.count} items`}
                  value={money(r.watch.total)}
                />
              </div>
              {toPay.length > 0 ? (
                <>
                  <a
                    href={`/plans/${goalId}/checkout`}
                    className="mt-1.5 flex min-h-12 items-center justify-center rounded-xl bg-primary font-semibold text-primary-foreground no-underline"
                  >
                    Review checkout
                  </a>
                  <span className="text-center text-xs text-muted-foreground">
                    You&apos;ll confirm with PayPal before anything is charged.
                  </span>
                </>
              ) : (
                <p className="rounded-xl bg-muted px-3.5 py-3 text-[13px] text-muted-foreground">
                  Nothing to pay right now. Everything is on price watch; press{" "}
                  <strong className="text-foreground">Buy now</strong> on an
                  item to check out.
                </p>
              )}
            </section>
          </>
        )}
        {watching.length + toPay.length > 0 && extra}
      </aside>

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(o) => !o && setToDelete(null)}
        title={deleting ? `Remove ${deleting.name}?` : "Remove item?"}
        confirmLabel="OK, remove"
        body={
          <>
            <span>
              It will be taken off this plan and out of your checkout.
            </span>
            {deleting?.kind !== "service" && deleting?.payType !== "watch" && (
              <span>
                <strong className="text-foreground">Not sure yet?</strong> Move
                it to price watch instead. We&apos;ll message you when the price
                drops, and nothing is charged until then.
              </span>
            )}
          </>
        }
        onConfirm={removeItem}
        extra={
          deleting &&
          deleting.kind !== "service" &&
          deleting.payType !== "watch"
            ? {
                label: "Move to price watch",
                onClick: async () => {
                  await watch(deleting.id, true);
                },
              }
            : undefined
        }
      />

      <ItemSheet
        item={item}
        onClose={() => setSelected(null)}
        onUse={useOffer}
        onWatch={(on) => item && watch(item.id, on)}
        onTarget={(t) => item && setTarget(item.id, t)}
      />
    </div>
  );
}

function Rail({
  color,
  label,
  sub,
  value,
}: {
  color: string;
  label: string;
  sub: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span
        className={`size-2.5 shrink-0 rounded-[3px] ${color}`}
        aria-hidden
      />
      <span className="flex-1">
        {label} <span className="text-muted-foreground">· {sub}</span>
      </span>
      <span className="tabular text-right font-semibold">{value}</span>
    </div>
  );
}
