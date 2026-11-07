import { ALL_TOOLS_ENABLED, PayPalAgentToolkit } from "@paypal/agent-toolkit/ai-sdk";
import { env } from "./env";
import { canSpend, record, withTimeout } from "./usage";

/**
 * Money-moving PayPal calls, executed directly through the official PayPal Agent Toolkit's tools.
 * The AI never calls these: only server code does, after the user approves, with amounts recomputed from our DB.
 */

type ToolkitTool = {
  parameters: { safeParse: (x: unknown) => { success: boolean; data?: unknown; error?: { issues: unknown } } };
  execute: (args: unknown, opts?: unknown) => Promise<unknown>;
};

let tools: Record<string, ToolkitTool> | null = null;
function getTools() {
  if (!env.paypalClientId || !env.paypalClientSecret) throw new PayPalError("PayPal keys are not configured");
  tools ??= new PayPalAgentToolkit({
    clientId: env.paypalClientId,
    clientSecret: env.paypalClientSecret,
    configuration: { actions: ALL_TOOLS_ENABLED, context: { sandbox: env.paypalEnv !== "live" } },
  }).getTools() as unknown as Record<string, ToolkitTool>;
  return tools;
}

export class PayPalError extends Error {
  constructor(message: string, public status?: number, public raw?: unknown) {
    super(message);
  }
}

/** Run one toolkit tool; returns parsed JSON. Throws PayPalError on validation/API errors. */
export async function paypal<T = Record<string, unknown>>(tool: string, args: Record<string, unknown>, timeoutMs = 25_000): Promise<T> {
  if (!(await canSpend("paypal", { calls: 1 }))) throw new PayPalError("Daily PayPal call budget reached");
  const t = getTools()[tool];
  if (!t) throw new PayPalError(`Unknown PayPal tool ${tool}`);
  const parsed = t.parameters.safeParse(args);
  if (!parsed.success) throw new PayPalError(`Invalid arguments for ${tool}`, 400, parsed.error?.issues);
  await record("paypal", { calls: 1 });
  const out = await withTimeout(t.execute(parsed.data, { toolCallId: `lifecart-${tool}`, messages: [] }), timeoutMs, `PayPal ${tool}`);
  const data = typeof out === "string" ? safeJson(out) : out;
  const err = data as { ok?: boolean; status?: number; message?: string; error?: unknown; name?: string; details?: unknown };
  if (err && (err.ok === false || (typeof err.name === "string" && /ERROR|INVALID|UNPROCESSABLE/.test(err.name)))) {
    throw new PayPalError(err.message ?? `PayPal ${tool} failed`, err.status, data);
  }
  return data as T;
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return { ok: false, message: s.slice(0, 300) };
  }
}

type Link = { href: string; rel: string };
export const linkOf = (o: { links?: Link[] }, rel: string) => o.links?.find((l) => l.rel === rel)?.href;

const money2 = (n: number) => Math.round(n * 100) / 100;

// ---- Orders -----------------------------------------------------------------------------------

export async function createOrder(input: { lines: { name: string; qty: number; unit: number }[]; returnUrl: string; cancelUrl: string; note?: string }) {
  const items = input.lines.map((l) => ({
    name: l.name.slice(0, 120),
    quantity: l.qty,
    itemCost: money2(l.unit),
    taxPercent: 0,
    itemTotal: money2(l.unit * l.qty),
  }));
  const o = await paypal<{ id: string; status: string; links?: Link[] }>("create_order", {
    currencyCode: "USD",
    items,
    notes: input.note ?? null,
    returnUrl: input.returnUrl,
    cancelUrl: input.cancelUrl,
  });
  const approveUrl = linkOf(o, "payer-action") ?? linkOf(o, "approve");
  if (!o.id || !approveUrl) throw new PayPalError("PayPal did not return an approval link", undefined, o);
  return { id: o.id, approveUrl };
}

export type CaptureResult = {
  id: string;
  status: string;
  payer?: { email_address?: string; name?: { given_name?: string; surname?: string } };
  purchase_units?: { payments?: { captures?: { id: string; status: string; amount: { value: string; currency_code: string } }[] } }[];
};

/**
 * Capture an approved order (toolkit `pay_order`).
 * Note: the toolkit wraps PayPal's response as { status: "success" | "error", response: <PayPal JSON> }.
 */
export async function captureOrder(orderId: string): Promise<CaptureResult> {
  const out = await paypal<{ status?: string; response?: CaptureResult } & CaptureResult>("pay_order", { id: orderId }, 30_000);
  if (out.response) {
    if (out.status === "error") throw new PayPalError("PayPal refused the capture", undefined, out.response);
    return out.response;
  }
  return out;
}

/** Sum of COMPLETED captures on an order. */
export function capturedTotal(o: CaptureResult) {
  const caps = o.purchase_units?.flatMap((pu) => pu.payments?.captures ?? []) ?? [];
  const done = caps.filter((c) => c.status === "COMPLETED");
  return { total: Math.round(done.reduce((s, c) => s + Number(c.amount.value), 0) * 100) / 100, captureId: done[0]?.id };
}

export async function getOrder(orderId: string) {
  return paypal<CaptureResult>("get_order", { id: orderId });
}

// ---- Subscriptions ------------------------------------------------------------------------------

export async function createMonthlySubscription(input: { name: string; monthly: number; returnUrl: string; cancelUrl: string }) {
  const product = await paypal<{ id: string }>("create_product", { name: input.name.slice(0, 120), type: "PHYSICAL", description: "Monthly refills via LifeCart" });
  const plan = await paypal<{ id: string }>("create_subscription_plan", {
    product_id: product.id,
    name: input.name.slice(0, 120),
    billing_cycles: [
      {
        frequency: { interval_unit: "MONTH", interval_count: 1 },
        tenure_type: "REGULAR",
        sequence: 1,
        total_cycles: 0,
        pricing_scheme: { fixed_price: { currency_code: "USD", value: money2(input.monthly).toFixed(2) } },
      },
    ],
    payment_preferences: { auto_bill_outstanding: true, payment_failure_threshold: 1 },
  });
  const sub = await paypal<{ id: string; status: string; links?: Link[] }>("create_subscription", {
    plan_id: plan.id,
    application_context: {
      brand_name: "LifeCart",
      user_action: "SUBSCRIBE_NOW",
      shipping_preference: "GET_FROM_FILE",
      return_url: input.returnUrl,
      cancel_url: input.cancelUrl,
    },
  });
  const approveUrl = linkOf(sub, "approve");
  if (!sub.id || !approveUrl) throw new PayPalError("PayPal did not return a subscription approval link", undefined, sub);
  return { id: sub.id, approveUrl, planId: plan.id };
}

export async function getSubscription(id: string) {
  return paypal<{ id: string; status: string; plan_id?: string; subscriber?: { email_address?: string } }>("show_subscription_details", { subscription_id: id });
}

// ---- Invoices ----------------------------------------------------------------------------------

export async function createAndSendInvoice(input: { provider: string; email: string; lines: { name: string; amount: number }[]; note?: string }) {
  const draft = await paypal<{ id?: string; href?: string; links?: Link[] }>("create_invoice", {
    currency_code: "USD",
    invoicer_business_name: input.provider.slice(0, 100),
    note: input.note?.slice(0, 400),
    primary_recipients: [{ billing_info: { email_address: input.email } }],
    items: input.lines.map((l) => ({ name: l.name.slice(0, 200), quantity: "1", unit_amount: { currency_code: "USD", value: money2(l.amount).toFixed(2) } })),
  });
  const id = draft.id ?? draft.href?.split("/").pop() ?? linkOf(draft, "self")?.split("/").pop();
  if (!id) throw new PayPalError("PayPal did not return an invoice id", undefined, draft);
  await paypal("send_invoice", { invoice_id: id, send_to_recipient: true });
  const inv = await paypal<{ status?: string; detail?: { metadata?: { recipient_view_url?: string } } }>("get_invoice", { invoice_id: id }).catch(() => null);
  return { id, status: inv?.status ?? "SENT", url: inv?.detail?.metadata?.recipient_view_url };
}
