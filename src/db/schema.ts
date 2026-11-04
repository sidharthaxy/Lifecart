import { boolean, integer, jsonb, numeric, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const payType = pgEnum("pay_type", ["order", "subscription", "invoice", "watch"]);
export const priority = pgEnum("priority", ["now", "can_wait"]);
export const billType = pgEnum("bill_type", ["rent", "electricity", "water", "internet", "phone", "subscription", "other"]);
export const approvalKind = pgEnum("approval_kind", ["cart", "bill", "watch", "renewal"]);
export const approvalStatus = pgEnum("approval_status", ["pending", "sent", "approved", "paid", "declined", "expired"]);

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const money = (name: string) => numeric(name, { precision: 12, scale: 2 });

export const users = pgTable("users", {
  id: id(),
  name: text("name").notNull(),
  phone: text("phone"),
  whatsappOptIn: boolean("whatsapp_opt_in").notNull().default(false),
  paypalPayerId: text("paypal_payer_id"),
  shipTo: text("ship_to"),
  createdAt: createdAt(),
});

export const goals = pgTable("goals", {
  id: id(),
  userId: uuid("user_id").notNull().references(() => users.id),
  prompt: text("prompt").notNull(),
  imageUrl: text("image_url"),
  budgetCap: money("budget_cap"),
  /** Context the agent extracted, e.g. { schedule: "9-7 weekdays", home: "apartment" } */
  context: jsonb("context").$type<Record<string, string>>(),
  /** Agent's step log shown in "What the agent did". */
  steps: jsonb("steps").$type<{ text: string; source?: string }[]>(),
  status: text("status").notNull().default("draft"),
  createdAt: createdAt(),
});

export const planItems = pgTable("plan_items", {
  id: id(),
  goalId: uuid("goal_id").notNull().references(() => goals.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  category: text("category").notNull(),
  reason: text("reason").notNull(),
  qty: integer("qty").notNull().default(1),
  priority: priority("priority").notNull().default("now"),
  payType: payType("pay_type").notNull().default("order"),
  targetPrice: money("target_price"),
  chosenOfferId: uuid("chosen_offer_id"),
  sort: integer("sort").notNull().default(0),
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

export const coupons = pgTable("coupons", {
  id: id(),
  merchant: text("merchant").notNull(),
  code: text("code").notNull(),
  terms: text("terms"),
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
  /** What will be paid: plan item ids, bill id, etc. */
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  status: approvalStatus("status").notNull().default("pending"),
  whatsappMessageId: text("whatsapp_message_id"),
  createdAt: createdAt(),
});

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
