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

let toolkit: PayPalAgentToolkit | null = null;
let tools: Record<string, ToolkitTool> | null = null;
function getToolkit() {
  if (!env.paypalClientId || !env.paypalClientSecret) throw new PayPalError("PayPal keys are not configured");
  toolkit ??= new PayPalAgentToolkit({
    clientId: env.paypalClientId,
    clientSecret: env.paypalClientSecret,
    configuration: { actions: ALL_TOOLS_ENABLED, context: { sandbox: env.paypalEnv !== "live" } },
  });
  return toolkit;
}
function getTools() {
  tools ??= getToolkit().getTools() as unknown as Record<string, ToolkitTool>;
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
  let data = typeof out === "string" ? safeJson(out) : out;
  // Some toolkit tools wrap PayPal's JSON as { status: "success" | "error", response: {...} }.
  const wrapped = data as { status?: unknown; response?: unknown };
  if (wrapped && typeof wrapped === "object" && "response" in wrapped && (wrapped.status === "success" || wrapped.status === "error")) {
    if (wrapped.status === "error") throw new PayPalError(`PayPal ${tool} failed`, undefined, wrapped.response);
    data = wrapped.response;
  }
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

/**
 * Create a PayPal order the buyer approves on PayPal.
 * This one call goes straight to Orders v2 (through the toolkit's own authenticated client) because the toolkit's
 * create_order tool doesn't expose experience_context: we need user_action PAY_NOW (button says "Pay Now", not
 * "Review Order"), our brand name, and an idempotency key so a retried request can't create a second order.
 */
export async function createOrder(input: {
  lines: { name: string; qty: number; unit: number }[];
  returnUrl: string;
  cancelUrl: string;
  note?: string;
  requestId: string;
}) {
  if (!(await canSpend("paypal", { calls: 1 }))) throw new PayPalError("Daily PayPal call budget reached");
  const tk = getToolkit();
  const total = money2(input.lines.reduce((a, l) => a + money2(l.unit) * l.qty, 0)).toFixed(2);
  const body = {
    intent: "CAPTURE",
    purchase_units: [
      {
        description: input.note?.slice(0, 127),
        items: input.lines.map((l) => ({
          name: l.name.slice(0, 127),
          quantity: String(l.qty),
          unit_amount: { currency_code: "USD", value: money2(l.unit).toFixed(2) },
        })),
        amount: { currency_code: "USD", value: total, breakdown: { item_total: { currency_code: "USD", value: total } } },
      },
    ],
    payment_source: {
      paypal: {
        experience_context: {
          brand_name: "LifeCart",
          user_action: "PAY_NOW",
          shipping_preference: "GET_FROM_FILE",
          return_url: input.returnUrl,
          cancel_url: input.cancelUrl,
        },
      },
    },
  };
  await record("paypal", { calls: 1 });
  const res = await withTimeout(
    fetch(`${tk.client.getBaseUrl()}/v2/checkout/orders`, {
      method: "POST",
      headers: { ...(await tk.client.getHeaders()), "Content-Type": "application/json", "PayPal-Request-Id": input.requestId },
      body: JSON.stringify(body),
    }),
    25_000,
    "PayPal create order",
  );
  const o = (await res.json().catch(() => ({}))) as { id?: string; status?: string; links?: Link[]; message?: string };
  if (!res.ok) throw new PayPalError(o.message ?? "PayPal couldn't create the order", res.status, o);
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
  const sent = await paypal<{ href?: string; rel?: string }>("send_invoice", { invoice_id: id, send_to_recipient: true });
  const inv = await paypal<{ status?: string; detail?: { metadata?: { recipient_view_url?: string } } }>("get_invoice", { invoice_id: id }).catch(() => null);
  return { id, status: inv?.status ?? "SENT", url: inv?.detail?.metadata?.recipient_view_url ?? (sent?.rel === "payer-view" ? sent.href : undefined) };
}

// ---- After-payment management ----------------------------------------------------------------------

export async function cancelSubscription(id: string, reason = "Cancelled by the customer in LifeCart") {
  await paypal("cancel_subscription", { subscription_id: id, payload: { reason } });
  return getSubscription(id);
}

export async function getInvoiceStatus(id: string) {
  const inv = await paypal<{ status?: string; detail?: { metadata?: { recipient_view_url?: string } } }>("get_invoice", { invoice_id: id });
  return { status: inv.status ?? "UNKNOWN", url: inv.detail?.metadata?.recipient_view_url };
}

// ---- Refunds ---------------------------------------------------------------------------------------

/**
 * Refund a capture (full, or a partial `amount`) with the toolkit's create_refund, then verify with get_refund.
 * Returns PayPal's own final status; never trust the create response alone.
 */
export async function refundCapture(captureId: string, opts: { amount?: number; note?: string } = {}) {
  const r = await paypal<{ id?: string; status?: string }>("create_refund", {
    capture_id: captureId,
    ...(opts.amount ? { amount: { currency_code: "USD", value: money2(opts.amount).toFixed(2) } } : {}),
    note_to_payer: (opts.note ?? "Refund from LifeCart").slice(0, 255),
  });
  if (!r.id) throw new PayPalError("PayPal did not return a refund id", undefined, r);
  const check = await paypal<{ id: string; status: string; amount?: { value: string } }>("get_refund", { refund_id: r.id });
  return { refundId: check.id, status: check.status, amount: Number(check.amount?.value ?? 0) };
}

/** Captures on the merchant account in a date range (toolkit list_transactions; needs "Transaction search"). */
export async function listCaptures(startISO: string, endISO: string) {
  const d = await paypal<{ transaction_details?: { transaction_info?: Record<string, unknown> }[] }>("list_transactions", {
    start_date: startISO,
    end_date: endISO,
    page_size: 100,
  });
  return (d.transaction_details ?? []).map((t) => {
    const i = (t.transaction_info ?? {}) as {
      transaction_id?: string;
      transaction_event_code?: string;
      transaction_status?: string;
      transaction_amount?: { value?: string };
      transaction_initiation_date?: string;
      paypal_reference_id?: string;
    };
    return {
      id: i.transaction_id ?? "",
      code: i.transaction_event_code ?? "",
      status: i.transaction_status ?? "",
      amount: Number(i.transaction_amount?.value ?? 0),
      at: i.transaction_initiation_date ?? "",
      ref: i.paypal_reference_id,
    };
  });
}

/**
 * Live status of one capture (COMPLETED / REFUNDED / PARTIALLY_REFUNDED / ...). Direct Payments v2 call through
 * the toolkit's authenticated client (the toolkit has no get-capture tool). Real-time, unlike transaction reports.
 */
export async function getCapture(captureId: string) {
  if (!/^[A-Z0-9]{10,30}$/.test(captureId)) throw new PayPalError("Bad capture id");
  if (!(await canSpend("paypal", { calls: 1 }))) throw new PayPalError("Daily PayPal call budget reached");
  const tk = getToolkit();
  await record("paypal", { calls: 1 });
  const res = await withTimeout(
    fetch(`${tk.client.getBaseUrl()}/v2/payments/captures/${captureId}`, { headers: await tk.client.getHeaders() }),
    15_000,
    "PayPal capture lookup",
  );
  const c = (await res.json().catch(() => ({}))) as { id?: string; status?: string; amount?: { value?: string }; create_time?: string; message?: string };
  if (!res.ok) throw new PayPalError(c.message ?? "Capture lookup failed", res.status, c);
  return { id: c.id ?? captureId, status: c.status ?? "UNKNOWN", amount: Number(c.amount?.value ?? 0), createdAt: c.create_time };
}

/** Subscription billing info: status and PayPal's record of the last payment (what was actually charged). */
export async function getSubscriptionBilling(id: string) {
  const s = await paypal<{
    status: string;
    billing_info?: { last_payment?: { amount?: { value?: string }; time?: string }; next_billing_time?: string };
  }>("show_subscription_details", { subscription_id: id });
  return {
    status: s.status,
    lastPayment: Number(s.billing_info?.last_payment?.amount?.value ?? 0),
    lastPaymentAt: s.billing_info?.last_payment?.time,
    nextBillingAt: s.billing_info?.next_billing_time,
  };
}
