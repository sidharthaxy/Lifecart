import { Suspense } from "react";
import { requireUser } from "@/lib/auth/session";
import {
  CheckCircle2,
  Droplet,
  Home,
  type LucideIcon,
  Receipt,
  Smartphone,
  Tv,
  Wifi,
  Zap,
} from "lucide-react";
import { AppHeader } from "@/components/app-header";
import {
  AddBillForm,
  DeleteBillButton,
  EditBillButton,
  PayBillsButton,
  PlanPicker,
  RemindButton,
  SampleBillsButton,
  SwitchPlanButton,
} from "@/components/bills/bill-controls";

/** For bills from before billing periods existed: assume the period started a month before the due date. */
const prevMonth = (iso: string) => {
  const d = new Date(iso);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString();
};
import { insights, listBills, type BillView } from "@/lib/bills";
import { money } from "@/lib/format";
import { alertNumber, maskedPhone } from "@/lib/whatsapp";

const ICON: Record<string, LucideIcon> = {
  phone: Smartphone,
  electricity: Zap,
  internet: Wifi,
  subscription: Tv,
  water: Droplet,
  rent: Home,
  other: Receipt,
};
const fmtDay = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
const MODE: Record<string, string> = {
  ask: "We'll remind you on WhatsApp",
  autopay_notify: "Autopay with a heads-up",
  remind: "Reminder 3 days before",
};

function dueLabel(b: BillView) {
  if (b.paid)
    return {
      text: `Paid · next due ${fmtDay(b.dueDate)}`,
      tone: "text-success",
    };
  if (b.daysLeft < 0)
    return {
      text: `Overdue since ${fmtDay(b.dueDate)}`,
      tone: "text-destructive",
    };
  if (b.daysLeft <= 3)
    return {
      text: `Due ${fmtDay(b.dueDate)} · in ${b.daysLeft} day${b.daysLeft === 1 ? "" : "s"}`,
      tone: "text-warning",
    };
  return { text: `Due ${fmtDay(b.dueDate)}`, tone: "text-foreground" };
}

async function BillsHub() {
  const user = await requireUser();
  const bills = await listBills(user.id);
  const demo = Boolean(user.prefs.demoTools);
  if (!bills.length)
    return (
      <section className="flex flex-col items-start gap-3 rounded-2xl border border-border bg-card p-8">
        <h2 className="text-xl font-bold">No bills yet</h2>
        <p className="max-w-xl text-muted-foreground">
          Add rent, electricity, internet, a phone top-up or a subscription with{" "}
          <strong>Add a bill</strong> above. We&apos;ll remind you on WhatsApp
          before each one is due, and you pay with PayPal.
        </p>
        {demo && <SampleBillsButton />}
      </section>
    );
  const unpaid = bills.filter((b) => !b.paid);
  const next30 = unpaid.filter((b) => b.daysLeft <= 30);
  const dueWeek = unpaid.filter((b) => b.daysLeft <= 7);
  const next = unpaid[0];
  const tips = insights(bills);
  const yearly = tips
    .filter((t) => t.tone === "save" && t.action)
    .reduce(
      (a, t) =>
        a +
        (bills.find((b) => b.id === t.billId)!.amount - t.action!.price) * 12,
      0,
    );
  const rent = bills.find((b) => b.type === "rent");
  const phone = bills.find((b) => b.type === "phone" && b.planOptions?.length);
  const phoneNum = maskedPhone(alertNumber(user));

  return (
    <div className="flex flex-col gap-6">
      <section
        aria-label="Summary"
        className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-4"
      >
        <div className="flex flex-col gap-1 rounded-2xl border border-border bg-card p-5">
          <span className="text-sm text-muted-foreground">
            Due in the next 30 days
          </span>
          <span className="tabular font-heading text-[32px] font-extrabold">
            {money(next30.reduce((a, b) => a + b.amount, 0))}
          </span>
          <span className="text-[13px] text-muted-foreground">
            {next30.length} bill{next30.length === 1 ? "" : "s"}
            {rent && !rent.paid ? ` · rent is ${money(rent.amount)} of it` : ""}
          </span>
        </div>
        <div className="flex flex-col gap-1 rounded-2xl border border-border bg-card p-5">
          <span className="text-sm text-muted-foreground">Next up</span>
          <span className="font-heading text-[32px] font-extrabold">
            {next ? fmtDay(next.dueDate) : "All paid"}
          </span>
          <span className="text-[13px] text-muted-foreground">
            {next
              ? `${next.name} · ${money(next.amount)}`
              : "Nothing due right now"}
          </span>
        </div>
        <div className="flex flex-col gap-1 rounded-2xl border border-border bg-card p-5">
          <span className="text-sm text-muted-foreground">The agent found</span>
          <span className="tabular font-heading text-[32px] font-extrabold text-success">
            {yearly > 0 ? `${money(yearly)}/yr` : "No savings yet"}
          </span>
          <span className="text-[13px] text-muted-foreground">
            {yearly > 0
              ? "by switching to a plan that fits your use"
              : "Your bills look right-sized"}
          </span>
        </div>
      </section>

      <section
        aria-labelledby="timeline"
        className="flex flex-col gap-3.5 rounded-2xl border border-border bg-card px-6 py-5"
      >
        <h2 id="timeline" className="text-base font-semibold">
          Coming up
        </h2>
        <div className="overflow-x-auto">
          <ol className="m-0 flex min-w-max list-none gap-3 p-0">
            {bills.map((b) => (
              <li
                key={b.id}
                className={
                  b.paid
                    ? "flex min-w-[140px] flex-col gap-1 rounded-xl border border-success/30 bg-success-soft px-3.5 py-3"
                    : "flex min-w-[140px] flex-col gap-1 rounded-xl border border-[#EEF1F5] bg-background px-3.5 py-3"
                }
              >
                <span className="text-xs font-semibold uppercase tracking-wide text-primary">
                  {new Date(b.dueDate).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })}
                </span>
                <span className="text-sm font-semibold">{b.name}</span>
                <span className="tabular text-[13px] text-muted-foreground">
                  {b.paid ? "Paid ✓" : money(b.amount)}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <div className="flex flex-wrap items-start gap-6">
        <section
          aria-labelledby="all"
          className="min-w-0 flex-[999_1_600px] overflow-hidden rounded-2xl border border-border bg-card"
        >
          <div className="flex flex-wrap items-center gap-3 border-b border-border px-6 py-4">
            <h2 id="all" className="flex-1 text-base font-semibold">
              All bills
            </h2>
            {dueWeek.length > 0 && (
              <PayBillsButton
                ids={dueWeek.map((b) => b.id)}
                label={`Pay ${dueWeek.length} due this week · ${money(dueWeek.reduce((a, b) => a + b.amount, 0))}`}
                primary
              />
            )}
          </div>
          <ul className="m-0 flex list-none flex-col divide-y divide-[#EEF1F5] p-0">
            {bills.map((b) => {
              const Icon = ICON[b.type] ?? Receipt;
              const due = dueLabel(b);
              const up = b.average && b.amount > b.average * 1.15;
              return (
                <li
                  key={b.id}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 px-6 py-3.5"
                >
                  <span
                    className={
                      b.paid
                        ? "flex size-11 shrink-0 items-center justify-center rounded-xl bg-success-soft text-success"
                        : "flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent text-primary"
                    }
                  >
                    {b.paid ? (
                      <CheckCircle2 className="size-5" aria-hidden />
                    ) : (
                      <Icon className="size-5" aria-hidden />
                    )}
                  </span>
                  <span className="flex min-w-[180px] flex-1 flex-col">
                    <span className="font-semibold">{b.name}</span>
                    <span className="text-[13px] text-muted-foreground">
                      {b.payee}
                      {b.accountLabel ? ` · ${b.accountLabel}` : ""}
                    </span>
                  </span>
                  <span className="flex min-w-[110px] flex-col">
                    <span className="tabular font-semibold">
                      {money(b.amount)}
                    </span>
                    {up && (
                      <span className="text-xs text-warning">
                        {Math.round((b.amount / b.average! - 1) * 100)}% above
                        average
                      </span>
                    )}
                  </span>
                  <span className="flex min-w-[170px] flex-col text-sm">
                    <span className={due.tone}>{due.text}</span>
                    <span className="text-xs text-muted-foreground">
                      Every {b.periodLabel}
                      {MODE[b.autopayMode] ? ` · ${MODE[b.autopayMode]}` : ""}
                    </span>
                  </span>
                  <span className="ml-auto flex items-center gap-1">
                    {b.paid ? (
                      <span className="rounded-full bg-success-soft px-3 py-1.5 text-xs font-semibold text-success">
                        Paid ✓
                      </span>
                    ) : (
                      <PayBillsButton ids={[b.id]} label="Pay" />
                    )}
                    <EditBillButton
                      id={b.id}
                      values={{
                        name: b.name,
                        payee: b.payee,
                        type: b.type,
                        amount: b.amount.toFixed(2),
                        periodStart: (b.periodStart ?? prevMonth(b.dueDate)).slice(0, 10),
                        dueDate: b.dueDate.slice(0, 10),
                      }}
                    />
                    <DeleteBillButton id={b.id} name={b.name} />
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="m-0 border-t border-border px-6 py-3 text-xs text-muted-foreground">
            <strong className="text-foreground">Where the money goes:</strong>{" "}
            in this sandbox version, bill payments are paid to LifeCart&apos;s
            PayPal account and recorded against the bill. Sending the money on
            to the biller (for example with PayPal Payouts to their PayPal
            email) isn&apos;t connected yet, so nothing reaches the payee.
          </p>
        </section>

        <aside className="flex flex-[1_1_340px] flex-col gap-4">
          {phone && (
            <section
              aria-labelledby="topup"
              className="flex flex-col gap-3.5 rounded-2xl border border-border bg-card p-5"
            >
              <h2 id="topup" className="text-base font-semibold">
                Phone top-up
              </h2>
              <span className="text-sm text-muted-foreground">
                {phone.accountLabel}
              </span>
              <PlanPicker
                billId={phone.id}
                options={phone.planOptions!}
                current={phone.amount}
              />
              {phone.paid ? (
                <span className="text-sm font-semibold text-success">
                  Topped up ✓ · next {fmtDay(phone.dueDate)}
                </span>
              ) : (
                <PayBillsButton
                  ids={[phone.id]}
                  label={`Top up ${money(phone.amount)} with PayPal`}
                  primary
                />
              )}
            </section>
          )}

          <section
            aria-labelledby="insights"
            className="flex flex-col gap-3.5 rounded-2xl border border-border bg-card p-5"
          >
            <h2 id="insights" className="text-base font-semibold">
              What the agent noticed
            </h2>
            {!tips.length && (
              <p className="text-sm text-muted-foreground">
                Nothing unusual this month.
              </p>
            )}
            {tips.map((t) => (
              <div
                key={t.billId + t.title}
                className={
                  t.tone === "warn"
                    ? "flex flex-col gap-1.5 rounded-xl bg-warning-soft p-3.5 text-sm text-[#5C3800]"
                    : "flex flex-col gap-1.5 rounded-xl bg-success-soft p-3.5 text-sm text-[#0B4F31]"
                }
              >
                <strong>{t.title}</strong>
                <span>{t.body}</span>
                {t.action && (
                  <SwitchPlanButton
                    billId={t.billId}
                    price={t.action.price}
                    label={t.action.label}
                  />
                )}
              </div>
            ))}
          </section>

          <section
            aria-labelledby="reminders"
            className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5"
          >
            <h2 id="reminders" className="text-base font-semibold">
              Reminders
            </h2>
            <p className="text-sm text-muted-foreground">
              {phoneNum
                ? `Bills due within 3 days arrive as one WhatsApp message to ${phoneNum}, with a single link to pay them with PayPal. At most once a day per bill.`
                : "Add your WhatsApp number in Profile to get one reminder for bills due within 3 days, with a single link to pay them with PayPal."}
            </p>
            {demo ? (
              <div className="flex flex-col gap-3">
                <RemindButton />
                <SampleBillsButton />
              </div>
            ) : (
              <p className="text-[13px] text-muted-foreground">
                Reminders go out automatically once a day.
              </p>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

export default function BillsPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader active="bills" />
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 pb-12 pt-8 sm:px-6">
        <section className="flex flex-wrap items-end gap-4">
          <div className="flex flex-1 flex-col gap-1.5">
            <h1 className="text-[34px] font-extrabold leading-tight">
              Bills and utilities
            </h1>
            <p className="text-muted-foreground">
              Rent, power, internet and top-ups in one place, paid with PayPal.
              Due dates come to you on WhatsApp.
            </p>
          </div>
          <AddBillForm />
        </section>
        <Suspense
          fallback={<div className="h-96 animate-pulse rounded-2xl bg-muted" />}
        >
          <BillsHub />
        </Suspense>
      </main>
    </div>
  );
}
