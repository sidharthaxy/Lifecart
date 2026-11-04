import Link from "next/link";

// Placeholder until the landing screen from the design is built.
export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-6 px-4 py-24 text-center">
      <span className="text-sm font-semibold uppercase tracking-wide text-primary">Your life, planned and paid</span>
      <h1 className="text-4xl font-extrabold leading-tight sm:text-5xl">
        Tell us what&apos;s changing. We&apos;ll plan the shopping and handle the bills.
      </h1>
      <p className="max-w-xl text-lg text-muted-foreground">LifeCart is being built. Check which integrations are connected:</p>
      <Link href="/setup" className="rounded-xl bg-primary px-6 py-3 font-semibold text-primary-foreground">
        Open setup status
      </Link>
    </main>
  );
}
