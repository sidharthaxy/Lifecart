"use client";

import { useActionState } from "react";
import { Check, Loader2 } from "lucide-react";
import { saveProfile, type ProfileState } from "@/app/auth-actions";
import type { UserPrefs } from "@/db/schema";

type Props = {
  onboarding?: boolean;
  user: { name: string; email: string; monthlyBudget: number | null; shipTo: string | null; prefs: UserPrefs };
  demoPhone: string | null;
};

function Toggle({ name, label, hint, defaultChecked }: { name: string; label: string; hint: string; defaultChecked?: boolean }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-3.5 has-[:checked]:border-primary/40 has-[:checked]:bg-accent/40">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="mt-0.5 size-[18px] accent-[#1F3FB0]" />
      <span className="flex flex-col gap-0.5">
        <span className="text-sm font-semibold">{label}</span>
        <span className="text-[13px] text-muted-foreground">{hint}</span>
      </span>
    </label>
  );
}

const field = "min-h-11 rounded-[10px] border border-input bg-[#FBFCFD] px-3.5 text-[15px] outline-none focus-visible:ring-2 focus-visible:ring-ring/40";

export function ProfileForm({ onboarding, user, demoPhone }: Props) {
  const [state, action, pending] = useActionState<ProfileState, FormData>(saveProfile, undefined);
  const p = user.prefs;

  return (
    <form action={action} className="flex flex-col gap-6">
      {onboarding && <input type="hidden" name="onboarding" value="1" />}

      <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-6">
        <h2 className="text-lg font-semibold">About you</h2>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-4">
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            Your name
            <input name="name" required maxLength={60} defaultValue={user.name} autoComplete="name" placeholder="Alex Kim" className={field} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            Email
            <input value={user.email} readOnly disabled className={`${field} cursor-not-allowed text-muted-foreground`} />
            <span className="text-xs font-normal text-success">Verified</span>
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            Ship orders to
            <input name="shipTo" maxLength={120} defaultValue={user.shipTo ?? ""} autoComplete="street-address" placeholder="City and ZIP, e.g. Austin, TX 78701" className={field} />
            <span className="text-xs font-normal text-muted-foreground">PayPal uses the address saved in your PayPal account at checkout.</span>
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            WhatsApp number
            <input value={demoPhone ? `${demoPhone} (LifeCart demo line)` : "Not available yet"} readOnly disabled className={`${field} cursor-not-allowed bg-muted text-muted-foreground`} />
            <span className="text-xs font-normal text-muted-foreground">During the hackathon every alert goes to one demo WhatsApp line. Your own number comes later.</span>
          </label>
        </div>
      </section>

      <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-6">
        <h2 className="text-lg font-semibold">Money</h2>
        <label className="flex max-w-sm flex-col gap-1.5 text-sm font-semibold">
          Monthly shopping budget
          <span className="flex min-h-11 items-center gap-1.5 rounded-[10px] border border-input bg-[#FBFCFD] px-3.5 focus-within:ring-2 focus-within:ring-ring/40">
            <span className="text-muted-foreground">$</span>
            <input name="monthlyBudget" inputMode="decimal" defaultValue={user.monthlyBudget ?? ""} placeholder="800" className="w-full bg-transparent text-[15px] outline-none" />
            <span className="text-[13px] font-normal text-muted-foreground">/month</span>
          </span>
          <span className="text-xs font-normal text-muted-foreground">New plans start with this budget. Bills aren&apos;t counted.</span>
        </label>
        <Toggle
          name="payInParts"
          label="Offer to pay in parts when I'm over budget"
          hint="If a checkout is more than your monthly budget, we'll point you to PayPal Pay in 4 (4 interest-free payments, for purchases from $30 to $1,500, if PayPal approves you)."
          defaultChecked={p.payInParts ?? true}
        />
      </section>

      <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-6">
        <h2 className="text-lg font-semibold">Alerts</h2>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-3">
          <Toggle name="alertPriceDrops" label="Price drops" hint="One WhatsApp message when a watched item really drops to your target." defaultChecked={p.alertPriceDrops ?? true} />
          <Toggle name="alertBills" label="Bills due" hint="One WhatsApp message when bills are due within 3 days." defaultChecked={p.alertBills ?? true} />
        </div>
      </section>

      {!onboarding && (
        <section className="flex flex-col gap-4 rounded-2xl border border-dashed border-border bg-card p-6">
          <h2 className="text-lg font-semibold">Demo tools</h2>
          <Toggle
            name="demoTools"
            label="Show demo tools"
            hint="Adds 'Add sample bills', 'Send reminder now' and 'Simulate a price drop' buttons, for showing LifeCart without waiting for real due dates or sales."
            defaultChecked={p.demoTools ?? false}
          />
        </section>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <button type="submit" disabled={pending} className="flex min-h-12 items-center gap-2 rounded-xl bg-primary px-6 font-semibold text-primary-foreground disabled:opacity-70">
          {pending && <Loader2 className="size-[18px] animate-spin" aria-hidden />}
          {onboarding ? "Start using LifeCart" : "Save changes"}
        </button>
        {state?.ok && (
          <span role="status" className="flex items-center gap-1.5 text-sm font-semibold text-success">
            <Check className="size-4" aria-hidden /> Saved
          </span>
        )}
        {state?.error && (
          <span role="alert" className="text-sm font-medium text-destructive">
            {state.error}
          </span>
        )}
      </div>
    </form>
  );
}
