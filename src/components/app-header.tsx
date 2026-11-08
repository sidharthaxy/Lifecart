import Link from "next/link";
import { Suspense } from "react";
import { Check } from "lucide-react";
import { UserMenu } from "@/components/auth/user-menu";
import { getSessionUser } from "@/lib/auth/session";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Home", key: "home" },
  { href: "/plans", label: "Plans", key: "plans" },
  { href: "/bills", label: "Bills", key: "bills" },
  { href: "/orders", label: "Orders & watch", key: "orders" },
  { href: "/money", label: "Money", key: "money" },
] as const;

async function HeaderUser() {
  const user = await getSessionUser();
  if (!user) return null;
  return <UserMenu name={user.name} email={user.email} />;
}

/** `signedOut`: the landing page header (logo only). */
export function AppHeader({ active, signedOut }: { active?: (typeof NAV)[number]["key"] | "profile"; signedOut?: boolean }) {
  return (
    <header className="border-b border-border bg-card">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5 text-foreground no-underline">
          <span className="flex size-8 items-center justify-center rounded-[9px] bg-primary">
            <Check className="size-[18px] text-primary-foreground" strokeWidth={2.4} aria-hidden />
          </span>
          <span className="font-heading text-[19px] font-extrabold tracking-tight">LifeCart</span>
        </Link>
        {signedOut ? (
          <span className="flex-1" />
        ) : (
          <nav aria-label="Main" className="flex flex-1 flex-wrap gap-1">
            {NAV.map((n) => (
              <Link
                key={n.key}
                href={n.href}
                className={cn(
                  "rounded-lg px-3 py-2 text-sm no-underline",
                  active === n.key ? "bg-accent font-semibold text-foreground" : "font-medium text-muted-foreground hover:text-foreground",
                )}
              >
                {n.label}
              </Link>
            ))}
          </nav>
        )}
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-warning-soft px-2.5 py-1 text-xs font-semibold text-warning">PayPal sandbox</span>
          {!signedOut && (
            <Suspense fallback={<span className="size-9 rounded-full bg-muted" aria-hidden />}>
              <HeaderUser />
            </Suspense>
          )}
        </div>
      </div>
    </header>
  );
}
