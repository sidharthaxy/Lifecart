import { Suspense } from "react";
import { CheckCircle2, Mail, MessageCircle, Wallet } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { ProfileForm } from "@/components/auth/profile-form";
import { signOut, signOutEverywhere } from "@/app/auth-actions";
import { requireUser } from "@/lib/auth/session";
import { num } from "@/lib/format";
import { maskedPhone } from "@/lib/whatsapp";

export const metadata = { title: "Profile · LifeCart" };

function Account({ icon: Icon, name, status, body, muted }: { icon: typeof Mail; name: string; status: string; body: string; muted?: boolean }) {
  return (
    <li className={`flex items-start gap-3 rounded-xl border border-border p-4 ${muted ? "bg-muted/60" : ""}`}>
      <span className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${muted ? "bg-muted text-muted-foreground" : "bg-accent text-primary"}`}>
        <Icon className="size-5" aria-hidden />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">{name}</span>
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${muted ? "bg-muted text-muted-foreground" : "bg-success-soft text-[#0B4F31]"}`}>{status}</span>
        </span>
        <span className="text-[13px] text-muted-foreground">{body}</span>
      </span>
    </li>
  );
}

async function Profile() {
  const user = await requireUser();
  const phone = maskedPhone();
  return (
    <div className="flex flex-col gap-6">
      <ProfileForm demoPhone={phone} user={{ name: user.name, email: user.email, monthlyBudget: num(user.monthlyBudget), shipTo: user.shipTo, prefs: user.prefs }} />

      <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-6">
        <h2 className="text-lg font-semibold">Connected accounts</h2>
        <ul className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-3">
          <Account icon={Mail} name="Email" status="Verified" body={`${user.email}. You sign in with a one-time code.`} />
          <Account icon={Wallet} name="PayPal" status="At checkout" body="You log in to PayPal (sandbox) each time you pay. LifeCart never sees your PayPal password or card." />
          <Account icon={MessageCircle} name="WhatsApp" status="Demo line" body={`Alerts go to the shared LifeCart demo line${phone ? ` (${phone})` : ""} during the hackathon.`} muted />
        </ul>
      </section>

      <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-6">
        <h2 className="text-lg font-semibold">Sign out</h2>
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <CheckCircle2 className="size-4 text-success" aria-hidden /> Member since {user.createdAt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
        </p>
        <div className="flex flex-wrap gap-3">
          <form action={signOut}>
            <button type="submit" className="min-h-11 rounded-[10px] border border-border px-4 text-sm font-semibold">
              Sign out
            </button>
          </form>
          <form action={signOutEverywhere}>
            <button type="submit" className="min-h-11 rounded-[10px] border border-border px-4 text-sm font-semibold text-muted-foreground">
              Sign out on all devices
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}

export default function ProfilePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader active="profile" />
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 pb-12 pt-8 sm:px-6">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-[34px] font-extrabold leading-tight">Profile and settings</h1>
          <p className="text-muted-foreground">What you&apos;ve told LifeCart, and how it works for you.</p>
        </div>
        <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-muted" />}>
          <Profile />
        </Suspense>
      </main>
    </div>
  );
}
