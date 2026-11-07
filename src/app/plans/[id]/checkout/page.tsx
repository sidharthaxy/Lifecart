import Link from "next/link";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { CheckCircle2 } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { PayButton } from "@/components/checkout/pay-button";
import { IndependentBadge } from "@/components/plan/bits";
import { latestApprovalForGoal } from "@/lib/approvals";
import { getDemoUser } from "@/lib/demo-user";
import { money } from "@/lib/format";
import { getPlan } from "@/lib/plans";
import type { ItemView } from "@/lib/totals";
import { maskedPhone } from "@/lib/whatsapp";

function Lane({ title, sub, color, children }: { title: string; sub: string; color: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3.5 rounded-2xl border border-border bg-card p-5" style={{ borderTop: `4px solid ${color}` }}>
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

async function Checkout({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const plan = await getPlan(id).catch(() => null);
  if (!plan) notFound();
  if (plan.goal.status !== "ready") redirect(`/plans/${id}`);
  const [user, last] = await Promise.all([getDemoUser(), latestApprovalForGoal(id)]);

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
  const belowList = unpaid.filter((i) => i.payType !== "watch" && i.offer?.wasPrice).reduce((a, i) => a + (i.offer!.wasPrice! - i.offer!.price) * i.qty, 0);
  const phone = maskedPhone();

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <Link href={`/plans/${id}`} className="text-sm font-medium no-underline">
          ← Back to plan
        </Link>
        <h1 className="text-[34px] font-extrabold leading-tight">Here&apos;s how we&apos;ll pay for it</h1>
        <p className="max-w-3xl text-muted-foreground">
          Each item is matched to the PayPal payment type that fits it. Review the split, then confirm once with PayPal. Nothing is charged before that.
        </p>
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

      {bought.length > 0 && (
        <p className="rounded-xl border border-border bg-card px-5 py-3 text-sm text-muted-foreground">
          <strong className="text-foreground">Already paid:</strong> {bought.map((i) => i.name).join(", ")}. These won&apos;t be charged again.
        </p>
      )}

      <div className="grid grid-cols-[repeat(auto-fit,minmax(270px,1fr))] items-start gap-4">
        <Lane title="One-time orders" sub="PayPal Orders · charged when you approve" color="var(--primary)">
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
          {!orders.length && <p className="text-sm text-muted-foreground">Nothing to buy right now.</p>}
        </Lane>

        <Lane title="Refills" sub="One PayPal Subscription · cancel anytime" color="var(--sub)">
          {subs.map((i) => (
            <Card key={i.id} title={i.name} amount={`${money(price(i))}/mo`}>
              <span className="text-[13px] text-muted-foreground">{i.offer?.source === "channel3" ? i.offer.merchant : "Estimated price"}</span>
            </Card>
          ))}
          {subs.length ? (
            <span className="text-[13px] text-muted-foreground">Billed together as {money(subTotal)}/month. We&apos;ll message you before each renewal.</span>
          ) : (
            <p className="text-sm text-muted-foreground">No refills in this plan.</p>
          )}
        </Lane>

        <Lane title="Local services" sub="PayPal Invoices · sent after you approve" color="var(--smb)">
          {services.map((i) => (
            <Card key={i.id} title={i.name} amount={`${money(price(i))}${i.cadence === "monthly" ? "/mo" : ""}`}>
              <span className="text-[13px] text-muted-foreground">{i.offer?.merchant ?? "Local provider"} · typical price</span>
            </Card>
          ))}
          {!services.length && <p className="text-sm text-muted-foreground">No services in this plan.</p>}
        </Lane>

        <Lane title="Waiting for a better price" sub="Price watch · nothing charged yet" color="#C98A1E">
          {watching.map((i) => (
            <Card key={i.id} title={i.name} amount={money(i.offer?.price ?? i.estimatedPrice)}>
              <span className="text-[13px] text-muted-foreground">Target {money(i.targetPrice)}</span>
            </Card>
          ))}
          <span className="text-[13px] text-muted-foreground">
            {watching.length ? "When a price hits your target, we'll WhatsApp you a link back here to buy it with PayPal. We never buy on our own." : "Nothing on watch. Use the Watch button in your plan to wait for a better price."}
          </span>
        </Lane>
      </div>

      <div className="flex flex-wrap items-start gap-6">
        <section className="flex min-w-0 flex-[999_1_520px] flex-col gap-4 rounded-2xl border border-border bg-card p-6">
          <h2 className="text-[17px] font-semibold">Payment details</h2>
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2.5 text-sm">
            <dt className="text-muted-foreground">Alerts</dt>
            <dd>{phone ? `WhatsApp ${phone} for price drops, bills and renewals` : "WhatsApp not connected"}</dd>
            <dt className="text-muted-foreground">Ship to</dt>
            <dd>{user.shipTo ?? "Not set"}</dd>
            <dt className="text-muted-foreground">Pay with</dt>
            <dd>PayPal (sandbox). Log in as your sandbox personal account.</dd>
          </dl>
          <div className="flex flex-wrap gap-2 border-t border-[#EEF1F5] pt-3.5 text-xs text-muted-foreground">
            <span className="font-semibold">Under the hood:</span>
            {["PayPal Agent Toolkit", "Orders v2", "Subscriptions", "Invoicing v2", "WhatsApp (Twilio)"].map((t) => (
              <span key={t} className="rounded-md bg-muted px-2 py-0.5">
                {t}
              </span>
            ))}
          </div>
        </section>

        <aside aria-label="Totals" className="flex flex-[1_1_320px] flex-col gap-4 rounded-2xl bg-ink p-6 text-white">
          <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-2.5 text-sm">
            <dt className="text-[#C3CAD6]">Orders</dt>
            <dd className="tabular text-right">{money(orderTotal)}</dd>
            <dt className="text-[#C3CAD6]">First month of refills</dt>
            <dd className="tabular text-right">{money(subTotal)}</dd>
            {belowList > 0 && (
              <>
                <dt className="text-[#9CE3BF]">Below list price</dt>
                <dd className="tabular text-right text-[#9CE3BF]">−{money(belowList)} included</dd>
              </>
            )}
          </dl>
          <div className="flex items-baseline justify-between border-t border-[#2A3446] pt-3.5">
            <span>Due on approval</span>
            <span className="tabular font-heading text-[32px] font-extrabold">{money(orderTotal + subTotal)}</span>
          </div>
          {services.length > 0 && (
            <span className="text-[13px] text-[#C3CAD6]">
              Service invoices ({services.map((s) => `${money(price(s))}${s.cadence === "monthly" ? "/mo" : ""}`).join(", ")}) arrive separately.
            </span>
          )}
          <PayButton goalId={id} disabled={orderTotal + subTotal <= 0 && !services.length} />
        </aside>
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
