import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { desc, eq, inArray, or, sql } from "drizzle-orm";
import { BellRing, CheckCircle2 } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { CheckPricesButton, SimulateDropButton } from "@/components/watch/watch-controls";
import { getDb, schema } from "@/db";
import { money, num } from "@/lib/format";
import { listWatched } from "@/lib/watch";
import { listManaged } from "@/lib/manage";
import { CancelRefillsButton } from "@/components/watch/cancel-refills";

const ago = (d: Date | null) => {
  if (!d) return "not checked yet";
  const m = Math.round((Date.now() - d.getTime()) / 60_000);
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

async function Watchlist() {
  await connection();
  const rows = await listWatched();
  const db = await getDb();
  const alerts = rows.length
    ? await db
        .select()
        .from(schema.approvals)
        .where(inArray(schema.approvals.status, ["pending", "sent"]))
        .orderBy(desc(schema.approvals.createdAt))
    : [];
  const alertFor = (itemId: string) =>
    alerts.find((a) => a.kind === "watch" && a.payload.watch?.itemId === itemId && a.expiresAt.getTime() > Date.now());

  return (
    <section aria-labelledby="watch" className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-6">
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex flex-1 flex-col gap-1">
          <h2 id="watch" className="text-lg font-semibold">
            Price watch
          </h2>
          <p className="text-sm text-muted-foreground">
            We check live prices at each store. When one hits your target, you get a WhatsApp message with a link back here to buy it with PayPal. We never buy on our own.
          </p>
        </div>
        {rows.length > 0 && <CheckPricesButton />}
      </div>

      {!rows.length ? (
        <p className="text-sm text-muted-foreground">
          Nothing on watch. In a plan, press <strong>Watch</strong> on any product to wait for a better price.
        </p>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] gap-4">
          {rows.map(({ item, offer, goal }) => {
            const target = num(item.targetPrice) ?? 0;
            const now = num(item.lastPrice) ?? num(offer?.price) ?? 0;
            const hit = now > 0 && now <= target;
            const alert = alertFor(item.id);
            return (
              <li key={item.id} className={hit ? "flex flex-col gap-3 rounded-xl border-2 border-success bg-[#F6FCF9] p-4" : "flex flex-col gap-3 rounded-xl border border-border p-4"}>
                <div className="flex items-start gap-3">
                  {offer?.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={offer.imageUrl} alt="" className="size-12 shrink-0 rounded-lg border border-border bg-white object-contain" />
                  ) : null}
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="font-semibold">{item.name}</span>
                    <span className="text-[13px] text-muted-foreground">
                      {offer?.merchant ?? "Store"} ·{" "}
                      <Link href={`/plans/${goal.id}`} className="text-[13px]">
                        {goal.title ?? "Plan"}
                      </Link>
                    </span>
                  </div>
                  <span className={hit ? "rounded-full bg-success px-2.5 py-1 text-xs font-semibold text-white" : "rounded-full bg-warning-soft px-2.5 py-1 text-xs font-semibold text-warning"}>
                    {hit ? "Target hit" : "Watching"}
                  </span>
                </div>
                <div className="flex items-end justify-between gap-3">
                  <span className="flex flex-col">
                    <span className="tabular font-heading text-[26px] font-extrabold">{money(now)}</span>
                    <span className="text-[13px] text-muted-foreground">Target {money(target)} · checked {ago(item.lastCheckedAt)}</span>
                  </span>
                </div>
                {alert ? (
                  <p className="flex items-center gap-2 text-[13px] text-[#0B4F31]">
                    <BellRing className="size-4" aria-hidden /> Alert sent {ago(alert.createdAt)}. The buy link is valid until{" "}
                    {alert.expiresAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}.
                  </p>
                ) : (
                  <SimulateDropButton itemId={item.id} />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

const STATUS_STYLE: Record<string, string> = {
  active: "bg-success-soft text-success",
  approved: "bg-success-soft text-success",
  paid: "bg-success-soft text-success",
  sent: "bg-accent text-primary",
  unpaid: "bg-warning-soft text-warning",
  cancelled: "bg-muted text-muted-foreground",
  canceled: "bg-muted text-muted-foreground",
};

async function Managed() {
  await connection();
  const items = await listManaged();
  if (!items.length) return null;
  return (
    <section aria-labelledby="managed" className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-6">
      <div className="flex flex-col gap-1">
        <h2 id="managed" className="text-lg font-semibold">
          Refills and service invoices
        </h2>
        <p className="text-sm text-muted-foreground">Live status from PayPal. Refills can be cancelled anytime.</p>
      </div>
      <ul className="flex flex-col divide-y divide-border">
        {items.map((m) => {
          const s = m.status.toLowerCase();
          return (
            <li key={m.paymentId} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3.5">
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-semibold">{m.rail === "subscription" ? `Refills: ${m.lines.join(", ")}` : m.lines[0]}</span>
                <span className="text-[13px] text-muted-foreground">
                  {m.rail === "subscription" ? "PayPal Subscription" : "PayPal Invoice"} · {m.title} · <span className="font-mono text-xs">{m.paypalId}</span>
                </span>
              </span>
              <span className="tabular font-semibold">
                {money(m.amount)}
                {m.rail === "subscription" ? "/mo" : ""}
              </span>
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${STATUS_STYLE[s] ?? "bg-muted text-foreground"}`}>{s.replace(/_/g, " ")}</span>
              {m.rail === "subscription" && ["active", "approved"].includes(s) && <CancelRefillsButton paymentId={m.paymentId} />}
              {m.rail === "invoice" && m.url && !["paid", "cancelled"].includes(s) && (
                <a href={m.url} target="_blank" rel="noreferrer" className="text-[13px] font-semibold">
                  Pay invoice
                </a>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

async function Payments() {
  await connection();
  const db = await getDb();
  // Finished checkouts, plus any approval where money was captured even if the later steps were abandoned.
  const paid = await db
    .select()
    .from(schema.approvals)
    .where(or(eq(schema.approvals.status, "paid"), sql`${schema.approvals.result}->>'captureId' is not null`))
    .orderBy(desc(schema.approvals.updatedAt))
    .limit(20);
  return (
    <section aria-labelledby="payments" className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-6">
      <h2 id="payments" className="text-lg font-semibold">
        Payments
      </h2>
      {!paid.length ? (
        <p className="text-sm text-muted-foreground">No payments yet. Pay from a plan&apos;s checkout, or buy a watched item when its price drops.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {paid.map((a) => {
            const r = a.result ?? {};
            const p = a.payload;
            return (
              <li key={a.id} className="flex flex-wrap items-start gap-x-4 gap-y-1 py-3.5">
                <CheckCircle2 className="mt-0.5 size-5 text-success" aria-hidden />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="font-semibold">{a.title}</span>
                  <span className="text-[13px] text-muted-foreground">
                    {a.kind === "watch" ? "Bought after a price drop" : a.kind === "bill" ? "Bill payment" : "Plan checkout"}
                    {a.status !== "paid" ? " (partly complete: order paid, later steps not finished)" : ""} ·{" "}
                    {a.updatedAt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                    {p.watch ? ` · saved ${money(Math.max(0, p.watch.was - p.watch.now))}` : ""}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {r.captureId ? `PayPal capture ${r.captureId}` : ""}
                    {p.subscriptions.length ? ` · refills ${money(p.subscriptionMonthly)}/mo ${(r.subscriptionStatus ?? "").toLowerCase()}` : ""}
                    {r.invoices?.length ? ` · ${r.invoices.length} invoice(s) sent` : ""}
                  </span>
                </span>
                <span className="tabular font-semibold">{money(r.capturedAmount ?? Number(a.amount))}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export default function OrdersPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader active="orders" />
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 pb-12 pt-8 sm:px-6">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-[34px] font-extrabold leading-tight">Orders and price watch</h1>
          <p className="text-muted-foreground">What you&apos;ve paid for, and what we&apos;re waiting on a better price for.</p>
        </div>
        <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-muted" />}>
          <Watchlist />
        </Suspense>
        <Suspense fallback={<div className="h-32 animate-pulse rounded-2xl bg-muted" />}>
          <Managed />
        </Suspense>
        <Suspense fallback={<div className="h-48 animate-pulse rounded-2xl bg-muted" />}>
          <Payments />
        </Suspense>
      </main>
    </div>
  );
}
