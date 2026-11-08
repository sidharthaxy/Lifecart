import Link from "next/link";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { CheckCircle2, Heart, SplitSquareHorizontal } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { PayButton } from "@/components/checkout/pay-button";
import { IndependentBadge } from "@/components/plan/bits";
import { latestApprovalForGoal } from "@/lib/approvals";
import { requireUser } from "@/lib/auth/session";
import { money } from "@/lib/format";
import { budgetStatus } from "@/lib/budget";
import { getPlan } from "@/lib/plans";
import type { ItemView } from "@/lib/totals";
import { maskedPhone } from "@/lib/whatsapp";

function Lane({ title, sub, color, children }: { title: string; sub: string; color: string; children: React.ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col gap-3.5 rounded-2xl border border-border bg-card p-5" style={{ borderTop: `4px solid ${color}` }}>
      <div className="flex flex-col">
        <h2 className="text-[17px] font-semibold">{title}</h2>
        <span className="text-[13px] text-muted-foreground">{sub}</span>
      </div>
      {children}
    </section>
  );
}

function Card({ title, amount, children }: { title: string; amount: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-[#EEF1F5] p-3.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-semibold">{title}</span>
        <span className="tabular shrink-0 font-semibold">{amount}</span>
      </div>
      {children}
    </div>
  );
}

const price = (i: ItemView) => (i.offer?.price ?? i.estimatedPrice ?? 0) * (i.kind === "service" ? 1 : i.qty);
const PAY_IN_4 = { min: 30, max: 1500 };

async function Checkout({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const plan = await getPlan(id, user.id).catch(() => null);
  if (!plan) notFound();
  if (plan.goal.status !== "ready") redirect(`/plans/${id}`);
  const last = await latestApprovalForGoal(id);

  const bought = plan.items.filter((i) => i.purchased);
  const unpaid = plan.items.filter((i) => !i.purchased);
  const orders = unpaid.filter((i) => i.payType === "order");
  const byStore = new Map<string, ItemView[]>();
  for (const i of orders) {
    const store = i.offer?.source === "channel3" ? i.offer.merchant : "Other items (estimated)";
    byStore.set(store, [...(byStore.get(store) ?? []), i]);
  }
  const subs = unpaid.filter((i) => i.payType === "subscription");
  const services = unpaid.filter((i) => i.payType === "invoice");
  const watching = unpaid.filter((i) => i.payType === "watch");
  const orderTotal = orders.reduce((a, i) => a + price(i), 0);
  const subTotal = subs.reduce((a, i) => a + price(i), 0);
  const dueNow = orderTotal + subTotal;
  const belowList = unpaid.filter((i) => i.payType !== "watch" && i.offer?.wasPrice).reduce((a, i) => a + (i.offer!.wasPrice! - i.offer!.price) * i.qty, 0);
  const phone = maskedPhone();
  // Compare with what's LEFT of this month's shopping budget, not the full amount.
  const b = await budgetStatus(user);
  const budget = b.left != null ? Math.max(0, b.left) : null;
  const overBudget = budget != null && dueNow > budget;
  const canSplit = dueNow >= PAY_IN_4.min && dueNow <= PAY_IN_4.max;
  const nothingToPay = dueNow <= 0 && !services.length;

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <Link href={`/plans/${id}`} className="text-sm font-medium no-underline">
          ← Back to plan
        </Link>
        <h1 className="text-[34px] font-extrabold leading-tight">Checkout</h1>
        <p className="max-w-3xl text-muted-foreground">Each item is matched to the PayPal payment type that fits it. Review it, then confirm once with PayPal. Nothing is charged before that.</p>
      </section>

      {last?.status === "paid" && (
        <div role="status" className="flex flex-wrap items-center gap-3 rounded-2xl border border-success/30 bg-success-soft px-5 py-4 text-[#0B4F31]">
          <CheckCircle2 className="size-5" aria-hidden />
          <span className="font-semibold">Paid {last.updatedAt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
          <span className="text-sm">
            {money(last.result?.capturedAmount ?? Number(last.amount))} with PayPal
            {last.result?.invoices?.length ? `, ${last.result.invoices.length} invoice(s) sent` : ""}.
          </span>
        </div>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-2">
        {/* Left half: what you'll pay, and the button */}
        <div className="flex flex-col gap-4 lg:sticky lg:top-6">
          <aside aria-label="Totals" className="flex flex-col gap-4 rounded-2xl bg-ink p-6 text-white">
            <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-2.5 text-sm">
              {orderTotal > 0 && (
                <>
                  <dt className="text-[#C3CAD6]">Orders</dt>
                  <dd className="tabular text-right">{money(orderTotal)}</dd>
                </>
              )}
              {subTotal > 0 && (
                <>
                  <dt className="text-[#C3CAD6]">First month of refills</dt>
                  <dd className="tabular text-right">{money(subTotal)}</dd>
                </>
              )}
              {belowList > 0 && (
                <>
                  <dt className="text-[#9CE3BF]">Below list price</dt>
                  <dd className="tabular text-right text-[#9CE3BF]">−{money(belowList)} included</dd>
                </>
              )}
            </dl>
            <div className="flex items-baseline justify-between border-t border-[#2A3446] pt-3.5">
              <span>Due on approval</span>
              <span className="tabular font-heading text-[32px] font-extrabold">{money(dueNow)}</span>
            </div>
            {services.length > 0 && (
              <span className="text-[13px] text-[#C3CAD6]">
                Service invoices ({services.map((s) => `${money(price(s))}${s.cadence === "monthly" ? "/mo" : ""}`).join(", ")}) arrive separately by email from PayPal.
              </span>
            )}
            {overBudget && user.prefs.payInParts !== false && (
              <div className="flex gap-2.5 rounded-xl bg-[#1B2740] p-3.5 text-[13px] text-[#DDE4F7]">
                <SplitSquareHorizontal className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>
                  This is {money(dueNow - budget!)} more than the {money(budget)} left in your shopping budget this month.{" "}
                  {canSplit
                    ? `On the PayPal screen, choose Pay Later to split it into 4 interest-free payments of about ${money(dueNow / 4)}, if PayPal offers it to you.`
                    : "PayPal Pay in 4 covers $30 to $1,500, so this total is too large to split. You could move some items to price watch first."}
                </span>
              </div>
            )}
            <PayButton goalId={id} disabled={nothingToPay} />
          </aside>

          <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-6">
            <h2 className="flex items-center gap-2 text-[17px] font-semibold">
              <Heart className="size-[18px] text-primary" aria-hidden /> Thanks for shopping with us
            </h2>
            <p className="text-sm text-muted-foreground">
              You&apos;ll pay securely on PayPal. After that we&apos;ll keep an eye on prices, refills and renewals for you, and message you only when something needs you.
            </p>
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 border-t border-[#EEF1F5] pt-3 text-sm">
              <dt className="text-muted-foreground">Ship to</dt>
              <dd>{user.shipTo ?? "The address in your PayPal account"}</dd>
              <dt className="text-muted-foreground">Alerts</dt>
              <dd>{phone ? `WhatsApp for price drops, bills and renewals` : "Not connected"}</dd>
            </dl>
          </section>
        </div>

        {/* Right half: only the sections that have something in them */}
        <div className="flex flex-col gap-4">
          {bought.length > 0 && (
            <p className="rounded-xl border border-border bg-card px-5 py-3 text-sm text-muted-foreground">
              <strong className="text-foreground">Already paid:</strong> {bought.map((i) => i.name).join(", ")}. These won&apos;t be charged again.
            </p>
          )}
          <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] items-start gap-4">
            {orders.length > 0 && (
              <Lane title="One-time orders" sub="Charged when you approve" color="var(--primary)">
                {[...byStore.entries()].map(([store, its]) => (
                  <Card key={store} title={store} amount={money(its.reduce((a, i) => a + price(i), 0))}>
                    {its.some((i) => i.offer?.independent && i.offer.source === "channel3") && (
                      <span>
                        <IndependentBadge />
                      </span>
                    )}
                    <span className="text-[13px] text-muted-foreground">{its.map((i) => i.name).join(", ")}</span>
                  </Card>
                ))}
              </Lane>
            )}

            {subs.length > 0 && (
              <Lane title="Monthly refills" sub="One subscription · cancel anytime" color="var(--sub)">
                {subs.map((i) => (
                  <Card key={i.id} title={i.name} amount={`${money(price(i))}/mo`}>
                    <span className="text-[13px] text-muted-foreground">{i.offer?.source === "channel3" ? i.offer.merchant : "Estimated price"}</span>
                  </Card>
                ))}
                <span className="text-[13px] text-muted-foreground">Billed together as {money(subTotal)}/month. We&apos;ll message you before each renewal.</span>
              </Lane>
            )}

            {services.length > 0 && (
              <Lane title="Local services" sub="Invoiced after you approve" color="var(--smb)">
                {services.map((i) => (
                  <Card key={i.id} title={i.name} amount={`${money(price(i))}${i.cadence === "monthly" ? "/mo" : ""}`}>
                    <span className="text-[13px] text-muted-foreground">{i.offer?.merchant ?? "Local provider"} · typical price</span>
                  </Card>
                ))}
              </Lane>
            )}

            {watching.length > 0 && (
              <Lane title="Waiting for a better price" sub="Nothing charged yet" color="#C98A1E">
                {watching.map((i) => (
                  <Card key={i.id} title={i.name} amount={money(i.offer?.price ?? i.estimatedPrice)}>
                    <span className="text-[13px] text-muted-foreground">Target {money(i.targetPrice)}</span>
                  </Card>
                ))}
                <span className="text-[13px] text-muted-foreground">When a price hits your target, we&apos;ll message you a link back here to buy it with PayPal.</span>
              </Lane>
            )}
          </div>
          {nothingToPay && !watching.length && <p className="rounded-xl border border-border bg-card px-5 py-4 text-sm text-muted-foreground">Everything in this plan is paid. Nice.</p>}
        </div>
      </div>
    </div>
  );
}

export default function CheckoutPage(props: PageProps<"/plans/[id]/checkout">) {
  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader active="plans" />
      <main className="mx-auto w-full max-w-7xl px-4 pb-12 pt-8 sm:px-6">
        <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-muted" />}>
          <Checkout params={props.params} />
        </Suspense>
      </main>
    </div>
  );
}
