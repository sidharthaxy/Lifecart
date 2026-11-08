// Refunds duplicate sandbox captures left by the Nov 8 capture bug. DRY RUN by default; pass --apply to refund.
// Usage: npx tsx --env-file=.env.local scripts/refund-duplicates.mts [--apply] [--amount 936.99] [--keep <captureId> ...]
// Needs the PayPal app feature "Transaction search". Never refunds a capture listed with --keep.
// Note: imports src/lib/paypal.ts, which records usage in the local DB, so stop `npm run dev` first.
const root = process.cwd();
const { listCaptures, refundCapture } = await import(root + "/src/lib/paypal.ts");

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const amount = Number(args[args.indexOf("--amount") + 1] ?? NaN) || 936.99;
const keep = new Set<string>(["3FS33897S9498312J"]); // the real, recorded iPhone 17 payment
for (let i = 0; i < args.length; i++) if (args[i] === "--keep" && args[i + 1]) keep.add(args[i + 1]);

const end = new Date();
const start = new Date(end.getTime() - 5 * 86_400_000);
const all = await listCaptures(start.toISOString().slice(0, 19) + "Z", end.toISOString().slice(0, 19) + "Z");
// T0006 = PayPal Checkout APIs payment; refunds show as T1107 with negative amounts.
const refundedRefs = new Set(all.filter((t: { code: string; ref?: string }) => t.code === "T1107" && t.ref).map((t: { ref?: string }) => t.ref));
const candidates = all.filter(
  (t: { code: string; amount: number; status: string; id: string }) =>
    t.code === "T0006" && Math.abs(t.amount - amount) < 0.005 && t.status === "S" && !keep.has(t.id) && !refundedRefs.has(t.id),
);

console.log(`transactions in the last 5 days: ${all.length}`);
console.log(`captures of $${amount}: ${all.filter((t: { code: string; amount: number }) => t.code === "T0006" && Math.abs(t.amount - amount) < 0.005).length} (keeping ${[...keep].join(", ")})`);
console.log(`duplicates to refund: ${candidates.length}`);
for (const c of candidates) console.log(`  ${c.at.slice(0, 19)}  ${c.id}  $${c.amount}`);

if (!apply) {
  console.log("\nDry run only. Re-run with --apply to refund these.");
  process.exit(0);
}
for (const c of candidates) {
  try {
    const r = await refundCapture(c.id, { note: "Duplicate charge refunded by LifeCart" });
    console.log(`refunded ${c.id}: refund ${r.refundId} status ${r.status} $${r.amount}`);
  } catch (e) {
    console.log(`FAILED ${c.id}: ${(e as Error).message}`);
  }
}
process.exit(0);
