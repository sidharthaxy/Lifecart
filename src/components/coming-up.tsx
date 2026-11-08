import Link from "next/link";
import { connection } from "next/server";
import { BellRing, CalendarClock, ChevronRight } from "lucide-react";
import { listBills } from "@/lib/bills";
import { money, num } from "@/lib/format";
import { listWatched } from "@/lib/watch";

const when = (days: number) => (days < 0 ? `${-days} day${days === -1 ? "" : "s"} overdue` : days === 0 ? "due today" : days === 1 ? "due tomorrow" : `due in ${days} days`);

/** Home: the next bills and watched prices, straight from the database (no API calls on page view). */
export async function ComingUp() {
  await connection();
  const [bills, watched] = await Promise.all([listBills(), listWatched()]);
  const due = bills.filter((b) => !b.paid && b.daysLeft <= 14).slice(0, 4);
  const thisWeek = bills.filter((b) => !b.paid && b.daysLeft <= 7).reduce((s, b) => s + b.amount, 0);
  const watch = watched.slice(0, 3).map(({ item, offer }) => {
    const now = num(item.lastPrice) ?? num(offer?.price) ?? 0;
    const target = num(item.targetPrice) ?? 0;
    return { id: item.id, name: item.name, now, target, gap: now - target };
  });
  if (!due.length && !watch.length) return null;

  return (
    <section aria-labelledby="coming-up" className="flex flex-col gap-4">
      <h2 id="coming-up" className="text-[22px] font-bold">
        Coming up
      </h2>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-4">
        {due.length > 0 && (
          <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center gap-2">
              <CalendarClock className="size-[18px] text-primary" aria-hidden />
              <span className="flex-1 font-semibold">Bills due soon</span>
              {thisWeek > 0 && <span className="tabular text-[13px] text-muted-foreground">{money(thisWeek)} this week</span>}
            </div>
            <ul className="flex flex-col divide-y divide-border">
              {due.map((b) => (
                <li key={b.id} className="flex items-center gap-3 py-2.5 text-sm">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium">{b.name}</span>
                    <span className={b.daysLeft <= 3 ? "text-[13px] font-semibold text-[#9A3412]" : "text-[13px] text-muted-foreground"}>{when(b.daysLeft)}</span>
                  </span>
                  <span className="tabular font-semibold">{money(b.amount)}</span>
                </li>
              ))}
            </ul>
            <Link href="/bills" className="flex items-center gap-1 self-start text-sm font-semibold">
              Pay with PayPal <ChevronRight className="size-4" aria-hidden />
            </Link>
          </div>
        )}
        {watch.length > 0 && (
          <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center gap-2">
              <BellRing className="size-[18px] text-primary" aria-hidden />
              <span className="flex-1 font-semibold">On price watch</span>
              <span className="text-[13px] text-muted-foreground">{watched.length} item{watched.length === 1 ? "" : "s"}</span>
            </div>
            <ul className="flex flex-col divide-y divide-border">
              {watch.map((w) => (
                <li key={w.id} className="flex items-center gap-3 py-2.5 text-sm">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium">{w.name}</span>
                    <span className="text-[13px] text-muted-foreground">
                      {w.gap <= 0 ? "At or below your target" : `${money(w.gap)} above your ${money(w.target)} target`}
                    </span>
                  </span>
                  <span className="tabular font-semibold">{money(w.now)}</span>
                </li>
              ))}
            </ul>
            <Link href="/orders" className="flex items-center gap-1 self-start text-sm font-semibold">
              See price watch <ChevronRight className="size-4" aria-hidden />
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}
