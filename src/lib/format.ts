const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
export const money = (n: number | null | undefined) => (n == null || Number.isNaN(n) ? "—" : usd.format(n));
export const num = (v: string | number | null | undefined) => (v == null ? null : typeof v === "number" ? v : Number(v));
