import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { Check, CheckCircle2, Lock, ExternalLink } from "lucide-react";
import { getApprovalByToken } from "@/lib/approvals";
import { money } from "@/lib/format";

export const metadata = { title: "Approve payment · LifeCart", robots: { index: false } };

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex items-center gap-2.5 border-b border-border bg-card px-5 py-4">
        <span className="flex size-7 items-center justify-center rounded-lg bg-primary">
          <Check className="size-4 text-primary-foreground" strokeWidth={2.4} aria-hidden />
        </span>
        <span className="font-heading flex-1 text-[17px] font-extrabold">LifeCart</span>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Lock className="size-3.5" aria-hidden /> Secure approval
        </span>
      </header>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 p-5">{children}</main>
    </div>
  );
}

function Notice({ title, body, children }: { title: string; body: string; children?: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-6">
      <h1 className="text-xl font-extrabold">{title}</h1>
      <p className="text-sm text-muted-foreground">{body}</p>
      {children}
    </section>
  );
}

const friendly = (e: string | null) =>
  !e ? null : /Invoicing|403/.test(e) ? "PayPal didn't allow sending invoices." : /mismatch/i.test(e) ? "The payment amount didn't match, so nothing was finalized." : "PayPal couldn't complete that step. You can try again.";

async function Approval({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await connection();
  const { token } = await params;
  const sp = await searchParams;
  const a = await getApprovalByToken(token);

  if (!a) return <Notice title="This link isn't valid" body="It may have been mistyped or replaced by a newer one. Open the latest message from LifeCart." />;
  const p = a.payload;
  const backToCheckout = (
    <Link href={`/plans/${p.goalId}/checkout`} className="self-start text-sm font-semibold">
      Go to checkout to send a new link
    </Link>
  );
  if (a.status === "expired") return <Notice title="This link has expired" body="Approval links work for 30 minutes and only once.">{backToCheckout}</Notice>;
  if (a.status === "declined") return <Notice title="You declined this payment" body="Nothing was charged.">{backToCheckout}</Notice>;

  if (a.status === "paid") {
    const r = a.result ?? {};
    return (
      <section className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-card p-6 text-center">
        <span className="flex size-16 items-center justify-center rounded-full bg-success-soft text-success">
          <CheckCircle2 className="size-9" aria-hidden />
        </span>
        <h1 className="text-2xl font-extrabold">All set</h1>
        <div className="flex w-full flex-col gap-2.5 rounded-xl border border-border p-4 text-left text-sm">
          {p.orders.length > 0 && (
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Order captured</span>
              <span className="tabular font-semibold">{money(r.capturedAmount ?? p.orderTotal)}</span>
            </div>
          )}
          {r.captureId && (
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">PayPal capture</span>
              <span className="font-mono text-xs">{r.captureId}</span>
            </div>
          )}
          {p.subscriptions.length > 0 && (
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Refills subscription</span>
              <span className="font-semibold">
                {money(p.subscriptionMonthly)}/mo · {(r.subscriptionStatus ?? "set up").toLowerCase()}
              </span>
            </div>
          )}
          {(r.invoices ?? []).map((inv) => (
            <div key={inv.id} className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Invoice: {inv.name}</span>
              {inv.url ? (
                <a href={inv.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 font-semibold">
                  Pay {money(inv.amount)} <ExternalLink className="size-3" aria-hidden />
                </a>
              ) : (
                <span className="font-semibold">{money(inv.amount)} sent</span>
              )}
            </div>
          ))}
        </div>
        {(r.notes ?? []).map((n) => (
          <p key={n} className="w-full rounded-lg bg-warning-soft px-3 py-2 text-left text-[13px] text-[#5C3800]">
            {n}
          </p>
        ))}
        <p className="text-sm text-muted-foreground">We&apos;ll message you tracking numbers when the stores ship.</p>
        <Link href={`/plans/${p.goalId}`} className="flex min-h-12 w-full items-center justify-center rounded-xl bg-primary font-bold text-primary-foreground no-underline">
          Back to my plan
        </Link>
      </section>
    );
  }

  const due = a.step === "subscription" ? p.subscriptionMonthly : Number(a.amount);
  const cta = a.step === "subscription" ? "Approve monthly refills with PayPal" : a.step === "invoices" ? "Send my service invoices" : "Continue with PayPal";
  const err = sp.error ? friendly(a.error) : null;

  return (
    <>
      <section className="flex flex-col gap-1">
        <span className="text-[13px] text-muted-foreground">{a.title}</span>
        <span className="tabular font-heading text-[44px] font-extrabold tracking-tight">{money(due)}</span>
        <span className="text-sm text-muted-foreground">
          {a.step === "subscription" ? "Order paid. One more step: start your monthly refills." : "Due on approval"}
        </span>
      </section>

      {sp.cancelled && <p className="rounded-xl bg-warning-soft px-4 py-3 text-sm text-[#5C3800]">You left PayPal before approving. Nothing was charged.</p>}
      {err && <p role="alert" className="rounded-xl bg-warning-soft px-4 py-3 text-sm text-[#5C3800]">{err}</p>}

      <section className="flex flex-col gap-2.5 rounded-2xl border border-border bg-card p-4 text-sm">
        {p.orders.map((l) => (
          <div key={l.itemId} className="flex justify-between gap-3">
            <span>
              {l.name}
              {l.qty > 1 ? ` × ${l.qty}` : ""} <span className="text-muted-foreground">· {l.merchant}</span>
            </span>
            <span className="tabular shrink-0">{money(l.unit * l.qty)}</span>
          </div>
        ))}
        {p.subscriptions.map((l) => (
          <div key={l.itemId} className="flex justify-between gap-3">
            <span>
              {l.name} <span className="text-muted-foreground">· monthly</span>
            </span>
            <span className="tabular shrink-0">{money(l.unit * l.qty)}</span>
          </div>
        ))}
        {p.invoices.length > 0 && (
          <div className="flex flex-col gap-1.5 border-t border-[#EEF1F5] pt-2.5 text-[13px] text-muted-foreground">
            <span className="font-semibold text-foreground">Invoiced separately after you approve</span>
            {p.invoices.map((l) => (
              <div key={l.itemId} className="flex justify-between gap-3">
                <span>{l.name}</span>
                <span className="tabular shrink-0">
                  {money(l.unit * l.qty)}
                  {l.cadence === "monthly" ? "/mo" : ""}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {p.shipTo && <p className="text-[13px] text-muted-foreground">Ships to {p.shipTo}. Refills can be cancelled anytime.</p>}

      <form method="post" action={`/approve/${token}/pay`} className="mt-auto flex flex-col gap-2.5 pt-2">
        <button type="submit" className="min-h-[52px] rounded-xl bg-ink font-bold text-white">
          {cta}
        </button>
        <span className="text-center text-xs text-muted-foreground">You&apos;ll log in to PayPal (sandbox) to approve. Link expires {a.expiresAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}.</span>
      </form>
    </>
  );
}

export default function ApprovePage(props: PageProps<"/approve/[token]">) {
  return (
    <Shell>
      <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-muted" />}>
        <Approval params={props.params} searchParams={props.searchParams} />
      </Suspense>
    </Shell>
  );
}
