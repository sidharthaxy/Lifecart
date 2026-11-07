import { generateText, Output } from "ai";
import { models } from "@/lib/ai";
import { choiceSchema, planSchema, type PlanDraft } from "./schemas";
import type { C3Offer } from "@/lib/channel3";

const SYSTEM = `You are LifeCart, a careful shopping planner for US households.
The user describes a life change (new pet, new apartment, baby, new job...). You produce a complete, realistic,
budget-aware shopping plan: everything they actually need, nothing filler.

Think through the user's real life before listing items:
- Time: how many hours are they away or busy? What happens during that time (care, safety, boredom, meals)?
- Space: home type and size constraints.
- Health and safety: first-week essentials, vet/medical, insurance-like needs.
- People: what services should a human provide that products can't?
- Money: what must be bought now vs. what can wait for a deal?
The best plans contain items that only make sense for THIS user (e.g. someone away 10 hours a day needs a midday
dog walker and a way to check in remotely; a small apartment needs compact options).

Rules:
- Tie every item's reason to the user's specific situation (schedule, home type, budget, family). Be concrete.
- 9 to 12 items total, in 3 to 5 need-based groups. The FIRST group must address the user's main constraint
  (e.g. "While you're away" for someone out 10 hours a day, "Small-space picks" for a studio) and hold the items
  that only make sense because of it.
- Include at least one service (payType "invoice") when a human service is genuinely useful.
- Products get a precise searchQuery a US online store would match (size, type, key spec), e.g. "42 inch wire dog crate with divider".
- Consumables bought repeatedly are payType "subscription" with cadence "monthly".
- Local recurring or one-off human services (dog walker, vet visit, cleaner, movers) are kind "service", payType "invoice",
  searchQuery "", with a generic provider label. Never invent real business names.
- 1-3 nice-to-have items that can wait get priority "can_wait", payType "watch", and a realistic targetPrice ~15-25% below typical.
- If a budget is given, keep the first-month total (one-time now + first month of recurring) within it when possible.
- Prices are honest US estimates in USD. Price services realistically per visit x visits per month
  (e.g. a 30-minute dog walk is about $20-25, so 5 walks a week is about $400-500/month; a first vet visit with vaccines is about $150-250).
- Only physical products can be "watch". Insurance is a monthly service ("invoice"), not a product.`;

export async function draftPlan(input: { prompt: string; budget?: number | null; imageNote?: string | null }): Promise<PlanDraft> {
  const lines = [`User says: """${input.prompt}"""`];
  if (input.budget) lines.push(`First-month budget: $${input.budget}`);
  if (input.imageNote) lines.push(`They also shared a photo. What it shows: ${input.imageNote}`);

  const { output } = await generateText({
    model: models.agent(),
    system: SYSTEM,
    prompt: lines.join("\n"),
    output: Output.object({ schema: planSchema }),
    temperature: 0.4,
    // gpt-oss is a reasoning model: keep thinking short so the JSON fits the free-tier token budget.
    maxOutputTokens: 5000,
    providerOptions: { groq: { reasoningEffort: "low" } },
    maxRetries: 2,
  });
  return output;
}

/** Describe an uploaded photo so the planner can use it (vision model). */
export async function describePhoto(dataUrl: string): Promise<string> {
  const { text } = await generateText({
    model: models.vision(),
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "In 1-2 sentences: what product(s) or situation does this photo show? Mention type, size, style if visible. No preamble." },
          { type: "file", data: dataUrl, mediaType: dataUrl.slice(5, dataUrl.indexOf(";")) || "image/jpeg" },
        ],
      },
    ],
    maxRetries: 1,
  });
  return text.replace(/\*\*/g, "").trim();
}

/** Pick the offer that genuinely matches each item (fast model). */
export async function chooseOffers(
  items: { name: string; searchQuery: string; estimatedPrice: number; offers: C3Offer[] }[],
): Promise<Map<number, number | null>> {
  const listing = items
    .map(
      (it, i) =>
        `Item ${i}: ${it.name} (looking for: ${it.searchQuery}; typical $${it.estimatedPrice})\n` +
        it.offers.map((o, j) => `  [${j}] ${o.title} | ${o.domain} | $${o.price}`).join("\n"),
    )
    .join("\n\n");

  const { output } = await generateText({
    model: models.fast(),
    system: `You match shopping-list items to store offers. For EVERY item return one choice.
- Pick an offer that is the right kind of product. Close variants are fine (different brand, similar size, a combo set, a 15 lb vs 14 lb bag).
- Avoid offers priced more than about 2x the typical price, and accessories/replacement parts instead of the product itself.
- Among acceptable offers, prefer the lower price.
- Use null only when no offer is even the right kind of product.`,
    prompt: listing,
    output: Output.object({ schema: choiceSchema }),
    temperature: 0,
    maxOutputTokens: 2500,
    providerOptions: { groq: { reasoningEffort: "low" } },
    maxRetries: 2,
  });
  return new Map(output.choices.map((c) => [c.item, c.offer]));
}
