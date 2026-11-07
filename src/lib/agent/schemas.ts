import { z } from "zod";

export const plannedItem = z.object({
  name: z.string().describe("Short product or service name, e.g. '42-inch wire crate with divider'"),
  reason: z.string().describe("One sentence tying this item to the user's situation (schedule, home, budget)."),
  kind: z.enum(["product", "service"]),
  searchQuery: z
    .string()
    .describe("For products: a specific shopping search query a US store would match. For services: empty string."),
  qty: z.number().int().min(1).max(10),
  priority: z.enum(["now", "can_wait"]).describe("'can_wait' for comfort items worth waiting for a price drop."),
  payType: z
    .enum(["order", "subscription", "invoice", "watch"])
    .describe(
      "order = one-time product purchase now; subscription = product re-bought on a schedule (food, refills); invoice = a local service (walker, vet, cleaner); watch = product that can wait for a price drop.",
    ),
  cadence: z.enum(["one_time", "monthly"]),
  estimatedPrice: z.number().describe("Typical US price in USD for qty 1 (monthly price if cadence is monthly)."),
  targetPrice: z.number().nullable().describe("Only for payType 'watch': a realistic deal price. Otherwise null."),
  provider: z.string().describe("For services: a generic local provider label, e.g. 'Local dog walker'. For products: empty string."),
});

export const planSchema = z.object({
  title: z.string().describe("Plan title, e.g. 'Your golden retriever plan'"),
  summary: z.string().describe("Two sentences on the approach, mentioning the user's constraints."),
  context: z
    .array(z.string())
    .describe(
      "2-4 short chips of facts the USER STATED (e.g. 'Away 9 AM - 7 PM on weekdays', 'First-month budget $1,000'). Never invent details like home size or family members; assumptions belong in the summary, phrased as assumptions.",
    ),
  groups: z
    .array(
      z.object({
        title: z.string().describe("Need-based group, e.g. 'While you're away', 'Essentials', 'Health', 'Services'"),
        why: z.string().describe("Few words on why this group exists for this user"),
        items: z.array(plannedItem).min(1),
      }),
    )
    .min(3)
    .max(5),
});
export type PlanDraft = z.infer<typeof planSchema>;
export type PlannedItem = z.infer<typeof plannedItem>;

export const choiceSchema = z.object({
  choices: z.array(
    z.object({
      item: z.number().int().describe("Item index as given"),
      offer: z.number().int().nullable().describe("Index of the best matching offer, or null if none really matches"),
    }),
  ),
});
