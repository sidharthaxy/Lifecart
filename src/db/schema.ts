import { boolean, integer, jsonb, numeric, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const payType = pgEnum("pay_type", ["order", "subscription", "invoice", "watch"]);
export const priority = pgEnum("priority", ["now", "can_wait"]);
export const billType = pgEnum("bill_type", ["rent", "electricity", "water", "internet", "phone", "subscription", "other"]);
export const approvalKind = pgEnum("approval_kind", ["cart", "bill", "watch", "renewal"]);
export const approvalStatus = pgEnum("approval_status", ["pending", "sent", "approved", "paid", "declined", "expired"]);

export type ClarifyQuestion = { id: string; question: string; why?: string; options: string[] };

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const money = (name: string) => numeric(name, { precision: 12, scale: 2 });

export type UserPrefs = {
  /** If a checkout is over the monthly shopping budget, suggest PayPal Pay Later (Pay in 4). */
  payInParts?: boolean;
  /** WhatsApp alerts (they go to the shared demo number during the hackathon). */
  alertPriceDrops?: boolean;
  alertBills?: boolean;
  /** Shows sample bills and the "simulate a price drop" button, for recording demos. */
  demoTools?: boolean;
};

export const users = pgTable("users", {
  id: id(),
  /** Lower-cased, verified by a one-time email code. */
  email: text("email").notNull().unique(),
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
  name: text("name").notNull().default(""),
  phone: text("phone"),
  whatsappOptIn: boolean("whatsapp_opt_in").notNull().default(false),
  paypalPayerId: text("paypal_payer_id"),
  shipTo: text("ship_to"),
  /** Monthly shopping budget (the default budget for new plans). */
  monthlyBudget: money("monthly_budget"),
  /** Day of the month (1-28) the shopping budget starts fresh. */
  budgetDay: integer("budget_day").notNull().default(1),
  prefs: jsonb("prefs").$type<UserPrefs>().notNull().default({}),
  /** Set when the welcome questions are done; until then the app sends you to /welcome. */
  onboardedAt: timestamp("onboarded_at", { withTimezone: true }),
  createdAt: createdAt(),
});

/** One-time sign-in codes (hashed). Single use, 10 minutes, 5 attempts. */
export const authCodes = pgTable("auth_codes", {
  id: id(),
  email: text("email").notNull(),
  codeHash: text("code_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  attempts: integer("attempts").notNull().default(0),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: createdAt(),
});

/** Database sessions: the cookie holds a random token; only its SHA-256 is stored, so sessions can be revoked. */
export const sessions = pgTable("sessions", {
  id: id(),
  tokenHash: text("token_hash").notNull().unique(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
});

export const goals = pgTable("goals", {
  id: id(),
  userId: uuid("user_id").notNull().references(() => users.id),
  prompt: text("prompt").notNull(),
  imageUrl: text("image_url"),
  /** Vision model's description of the photo, cached so it runs once. */
  imageNote: text("image_note"),
  budgetCap: money("budget_cap"),
  title: text("title"),
  summary: text("summary"),
  /** Short context chips the agent extracted, e.g. "Away 9 AM - 7 PM on weekdays". */
  context: jsonb("context").$type<string[]>(),
  /** Error message if the agent run failed. */
  error: text("error"),
  /** Clarifying questions the agent asked before planning (null = not asked yet, [] = none needed). */
  questions: jsonb("questions").$type<ClarifyQuestion[]>(),
  /** The user's answers, keyed by question id (null = not answered yet). */
  answers: jsonb("answers").$type<Record<string, string>>(),
  /** Agent's step log shown in "What the agent did". */
  steps: jsonb("steps").$type<{ text: string; source?: string }[]>(),
  status: text("status").notNull().default("draft"),
  /** When the current agent run started; a "running" goal older than the run deadline is treated as crashed. */
  runStartedAt: timestamp("run_started_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const planItems = pgTable("plan_items", {
  id: id(),
  goalId: uuid("goal_id").notNull().references(() => goals.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  category: text("category").notNull(),
  categoryWhy: text("category_why"),
  reason: text("reason").notNull(),
  kind: text("kind").notNull().default("product"), // product | service
  cadence: text("cadence").notNull().default("one_time"), // one_time | monthly
  searchQuery: text("search_query"),
  estimatedPrice: money("estimated_price"),
  qty: integer("qty").notNull().default(1),
  priority: priority("priority").notNull().default("now"),
  payType: payType("pay_type").notNull().default("order"),
  targetPrice: money("target_price"),
  chosenOfferId: uuid("chosen_offer_id"),
  sort: integer("sort").notNull().default(0),
  /** Set when a PayPal payment for this item is captured, so it's never charged twice. */
  purchasedAt: timestamp("purchased_at", { withTimezone: true }),
  /** Price watch: last time we checked the live price, and that price. */
  lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
  lastPrice: money("last_price"),
});

export const offers = pgTable("offers", {
  id: id(),
  planItemId: uuid("plan_item_id").notNull().references(() => planItems.id, { onDelete: "cascade" }),
  /** Stable key for price history across plans, e.g. merchant + product id. */
  offerKey: text("offer_key").notNull(),
  merchant: text("merchant").notNull(),
  title: text("title").notNull(),
  url: text("url"),
  imageUrl: text("image_url"),
  price: money("price").notNull(),
  wasPrice: money("was_price"),
  currency: text("currency").notNull().default("USD"),
  shipping: money("shipping").default("0"),
  isSmb: boolean("is_smb").notNull().default(false),
  availability: text("availability"),
  /** Channel3 price status for this product, e.g. "typical", "low", "high". */
  priceStatus: text("price_status"),
  stats: jsonb("stats").$type<{ min?: number; max?: number; mean?: number; current?: number }>(),
  rank: integer("rank").notNull().default(0),
  couponId: uuid("coupon_id"),
  source: text("source").notNull().default("seed"),
});

export const priceSnapshots = pgTable("price_snapshots", {
  id: id(),
  offerKey: text("offer_key").notNull(),
  price: money("price").notNull(),
  capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
  /** "live" from Channel3 / re-pricing job, "seeded" for demo history. */
  source: text("source").notNull().default("live"),
});

/**
 * Offers found on the web for a store (by domain), when a user presses "Find coupons". Shared across users
 * (it's public web data, not personal) and reused for 12 hours so the same store isn't searched again.
 */
export const coupons = pgTable("coupons", {
  id: id(),
  /** Store domain, e.g. "chewy.com". */
  domain: text("domain").notNull().default(""),
  merchant: text("merchant").notNull(),
  /** e.g. "Take 15% off your order". */
  title: text("title").notNull().default(""),
  /** e.g. "15% off", "$20 off". */
  discountText: text("discount_text"),
  /** Only when the page showed the full code (checked to appear verbatim on the source page). */
  code: text("code"),
  terms: text("terms"),
  expires: text("expires"),
  sourceUrl: text("source_url"),
  sourceName: text("source_name"),
  discount: money("discount"),
  verified: boolean("verified").notNull().default(false),
  status: text("status").notNull().default("untested"), // worked | expired | not_needed | untested
  foundAt: createdAt(),
});

export const bills = pgTable("bills", {
  id: id(),
  userId: uuid("user_id").notNull().references(() => users.id),
  type: billType("type").notNull(),
  name: text("name").notNull(),
  payee: text("payee").notNull(),
  /** PayPal email or merchant id of the payee (landlord, demo biller). */
  payeeAccount: text("payee_account"),
  amount: money("amount").notNull(),
  averageAmount: money("average_amount"),
  dueDate: timestamp("due_date", { withTimezone: true }).notNull(),
  autopayMode: text("autopay_mode").notNull().default("ask"), // ask | autopay_notify | remind
  /** Short account label shown to the user, e.g. "Prepaid plan · (415) ···0142". */
  accountLabel: text("account_label"),
  /** When the current period was paid (null = still due). Paying rolls dueDate to the next month. */
  paidAt: timestamp("paid_at", { withTimezone: true }),
  lastRemindedAt: timestamp("last_reminded_at", { withTimezone: true }),
  /** Phone top-up plans to choose from, and what the user actually uses (for the agent's savings insight). */
  planOptions: jsonb("plan_options").$type<{ price: number; label: string }[]>(),
  usageNote: text("usage_note"),
  createdAt: createdAt(),
});

export const watches = pgTable("watches", {
  id: id(),
  planItemId: uuid("plan_item_id").notNull().references(() => planItems.id, { onDelete: "cascade" }),
  targetPrice: money("target_price").notNull(),
  status: text("status").notNull().default("watching"), // watching | hit | bought | stopped
  lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
});

export const approvals = pgTable("approvals", {
  id: id(),
  userId: uuid("user_id").notNull().references(() => users.id),
  kind: approvalKind("kind").notNull(),
  amount: money("amount").notNull(),
  title: text("title").notNull(),
  /** What will be paid, frozen at approval time (amounts are never taken from the browser). */
  payload: jsonb("payload").$type<ApprovalPayload>().notNull(),
  /** SHA-256 of the single-use link token; the raw token only ever exists in the WhatsApp link. */
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  status: approvalStatus("status").notNull().default("pending"),
  /** Where the PayPal flow is: order -> subscription -> invoices -> done */
  step: text("step").notNull().default("order"),
  whatsappMessageId: text("whatsapp_message_id"),
  paypalOrderId: text("paypal_order_id"),
  paypalSubscriptionId: text("paypal_subscription_id"),
  payerEmail: text("payer_email"),
  result: jsonb("result").$type<ApprovalResult>(),
  error: text("error"),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ApprovalLine = { itemId: string; name: string; merchant: string; qty: number; unit: number };
export type ApprovalPayload = {
  goalId: string;
  /** For price-drop approvals: the watched item and the prices that triggered the alert. */
  watch?: { itemId: string; was: number; now: number; target: number };
  /** For bill payments: which bills this approval pays (goalId is "" for bills). */
  bills?: { ids: string[] };
  orders: ApprovalLine[];
  orderTotal: number;
  subscriptions: ApprovalLine[];
  subscriptionMonthly: number;
  invoices: (ApprovalLine & { cadence: "one_time" | "monthly" })[];
  shipTo?: string;
};
export type ApprovalResult = {
  captureId?: string;
  capturedAmount?: number;
  subscriptionStatus?: string;
  invoices?: { id: string; name: string; amount: number; url?: string; status: string }[];
  notes?: string[];
};

export const payments = pgTable("payments", {
  id: id(),
  approvalId: uuid("approval_id").notNull().references(() => approvals.id),
  rail: payType("rail").notNull(),
  paypalId: text("paypal_id"),
  amount: money("amount").notNull(),
  status: text("status").notNull().default("created"),
  tracking: jsonb("tracking").$type<{ carrier?: string; number?: string; status?: string }>(),
  createdAt: createdAt(),
});

/** Daily API usage per provider, so we can show it and stop before free-tier limits run out. */
export const apiUsage = pgTable(
  "api_usage",
  {
    day: text("day").notNull(), // YYYY-MM-DD (UTC)
    provider: text("provider").notNull(), // groq | channel3 | kernel | twilio | paypal
    calls: integer("calls").notNull().default(0),
    units: integer("units").notNull().default(0), // tokens for groq, credits for channel3, seconds for kernel
    /** Latest provider-reported limits, e.g. Groq's x-ratelimit-remaining-* headers. */
    meta: jsonb("meta").$type<Record<string, string | number>>(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("api_usage_day_provider_idx").on(t.day, t.provider)],
);
