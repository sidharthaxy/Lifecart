"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { LogOut, UserRound, Wallet } from "lucide-react";
import { signOut } from "@/app/auth-actions";

export function UserMenu({ name, email }: { name: string; email: string }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const initials =
    (name || email)
      .split(/[\s@._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join("") || "?";

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const item = "flex min-h-10 w-full items-center gap-2.5 rounded-lg px-3 text-sm text-foreground no-underline hover:bg-accent";
  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account menu for ${name || email}`}
        onClick={() => setOpen((o) => !o)}
        className="flex size-9 items-center justify-center rounded-full bg-[#DDE4F7] text-sm font-semibold text-primary hover:ring-2 hover:ring-primary/30"
      >
        {initials}
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-11 z-50 flex w-64 flex-col gap-1 rounded-xl border border-border bg-card p-2 shadow-[0_12px_32px_rgba(14,23,38,0.14)]">
          <div className="flex flex-col px-3 py-2">
            <span className="truncate font-semibold">{name || "Your account"}</span>
            <span className="truncate text-[13px] text-muted-foreground">{email}</span>
          </div>
          <div className="h-px bg-border" />
          <Link role="menuitem" href="/profile" className={item} onClick={() => setOpen(false)}>
            <UserRound className="size-4 text-muted-foreground" aria-hidden /> Profile and settings
          </Link>
          <Link role="menuitem" href="/money" className={item} onClick={() => setOpen(false)}>
            <Wallet className="size-4 text-muted-foreground" aria-hidden /> Money
          </Link>
          <div className="h-px bg-border" />
          <form action={signOut}>
            <button role="menuitem" type="submit" className={item}>
              <LogOut className="size-4 text-muted-foreground" aria-hidden /> Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
