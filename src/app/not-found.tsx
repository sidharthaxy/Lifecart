import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4 text-center">
      <span className="text-[13px] font-semibold uppercase tracking-wide text-primary">Not found</span>
      <h1 className="text-3xl font-extrabold">We couldn&apos;t find that page</h1>
      <p className="max-w-md text-muted-foreground">It may have moved, or it belongs to a different account.</p>
      <Link href="/" className="rounded-xl bg-primary px-5 py-2.5 font-semibold text-primary-foreground no-underline">
        Go to LifeCart
      </Link>
    </main>
  );
}
