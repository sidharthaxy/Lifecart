import { Suspense } from "react";
import { connection } from "next/server";
import { RefreshCw, ShieldCheck } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { MoneyLedger } from "@/components/money/money-ledger";
import { MoneyCalendar } from "@/components/money/money-calendar";
import { CALENDAR_LANES } from "@/components/money/lanes";
import { refreshMoney } from "@/app/actions";
import { getMoney } from "@/lib/money";
import { money } from "@/lib/format";

export const metadata = { title: "Money · LifeCart" };

function Tile({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl border border-border bg-card p-5">
      <span className="text-[13px] font-semibold text-muted-foreground">{label}</span>
      <span className="tabular font-heading text-[32px] font-extrabold leading-tight tracking-tight">{value}</span>
      <span className="text-[13px] text-muted-foreground">{note}</span>
    </div>
  );
}

/** Single-series horizontal bars: one hue, value labels in text ink, hover tooltip per bar. */
function SpendBySource({ data, total }: { data: { source: string; amount: number }[]; total: number }) {
  const max = Math.max(...data.map((d) => d.amount), 1);
  if (!data.length) return <p className="text-sm text-muted-foreground">Nothing spent yet.</p>;
  return (
    <ul className="flex flex-col gap-3" aria-label="Spend by type">
      {data.map((d) => {
        const share = total ? Math.round((d.amount / total) * 100) : 0;
        return (
          <li key={d.source} className="group relative grid grid-cols-[110px_1fr_auto] items-center gap-3 text-sm">
            <span className="text-muted-foreground">{d.source}</span>
            <span className="h-3 rounded-r bg-transparent">
              <span className="block h-3 rounded-r-[4px] bg-[#3B5BDB] transition-opacity group-hover:opacity-80" style={{ width: `${Math.max(2, (d.amount / max) * 100)}%` }} />
            </span>
            <span className="tabular font-semibold">{money(d.amount)}</span>
            <span
              role="tooltip"
              className="pointer-events-none absolute -top-9 left-[120px] z-10 hidden whitespace-nowrap rounded-lg bg-ink px-2.5 py-1.5 text-xs text-white shadow-md group-hover:block"
            >
              {d.source}: {money(d.amount)} · {share}% of spend
            </span>
          </li>
        );
      })}
    </ul>
  );
}

async function MoneyBody() {
  await connection();
  const m = await getMoney();
  const t = m.totals;
  const checked = new Date(m.checkedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const verified = m.rows.filter((r) => r.verified === "Verified with PayPal").length;

  return (
    <>
      <section aria-label="Totals" className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
        <Tile label="Spent through LifeCart" value={money(t.spent)} note="After refunds, checked with PayPal" />
        <Tile label="Saved" value={money(t.saved)} note="Below list price and price-drop buys" />
        <Tile label="Refunded" value={money(t.refunded)} note="Back to your PayPal account" />
        <Tile label="Monthly recurring" value={money(t.recurring)} note={`${money(t.billsMonthly)} bills · ${money(t.refillsMonthly)} refills`} />
      </section>

      <section aria-labelledby="by-type" className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-6">
        <div className="flex flex-wrap items-start gap-4">
          <div className="flex flex-1 flex-col gap-1">
            <h2 id="by-type" className="text-lg font-semibold">
              Spend by type
            </h2>
            <p className="text-sm text-muted-foreground">What counts as spent, after refunds.</p>
          </div>
          <p className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
            <ShieldCheck className="size-4 text-success" aria-hidden />
            {verified} of {m.rows.length} payments match PayPal · checked {checked}
          </p>
        </div>
        <SpendBySource data={m.bySource} total={t.spent} />
      </section>

      <section aria-labelledby="ledger" className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-6">
        <div className="flex flex-wrap items-start gap-4">
          <div className="flex flex-1 flex-col gap-1">
            <h2 id="ledger" className="text-lg font-semibold">
              Every payment
            </h2>
            <p className="text-sm text-muted-foreground">
              Each one is checked live with PayPal. Refunds, cancelled refills and unpaid invoices don&apos;t count as spent.
              {m.reportNote ? ` ${m.reportNote}` : ""}
            </p>
          </div>
          <form action={refreshMoney}>
            <button type="submit" className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-semibold">
              <RefreshCw className="size-4" aria-hidden /> Re-check with PayPal
            </button>
          </form>
        </div>
        <MoneyLedger rows={m.rows} />
      </section>

      <section aria-labelledby="calendar" className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-6">
        <div className="flex flex-col gap-1">
          <h2 id="calendar" className="text-lg font-semibold">
            Money calendar
          </h2>
          <p className="text-sm text-muted-foreground">Bills coming due, refill renewals, and what you&apos;ve already paid or had refunded.</p>
        </div>
        <ul className="flex flex-wrap gap-4 text-[13px]" aria-label="Legend">
          {CALENDAR_LANES.map((l) => (
            <li key={l.id} className="flex items-center gap-2">
              <span className="size-3 rounded-[3px]" style={{ background: l.eventColor }} aria-hidden />
              {l.name}
            </li>
          ))}
        </ul>
        <MoneyCalendar events={m.events} />
      </section>
    </>
  );
}

export default function MoneyPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader active="money" />
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 pb-12 pt-8 sm:px-6">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-[34px] font-extrabold leading-tight">Money</h1>
          <p className="text-muted-foreground">Everything you&apos;ve paid through LifeCart, what you saved, and what&apos;s coming up.</p>
        </div>
        <Suspense fallback={<div className="h-[600px] animate-pulse rounded-2xl bg-muted" />}>
          <MoneyBody />
        </Suspense>
      </main>
    </div>
  );
}
