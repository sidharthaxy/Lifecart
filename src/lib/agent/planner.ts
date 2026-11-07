import { generateText, Output } from "ai";
import { guardedGroq, models } from "@/lib/ai";
import { choiceSchema, clarifySchema, planSchema, type PlanDraft } from "./schemas";
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
- Size the plan to the request:
  * A specific item ("a USB-C charger for my iPhone 15"): 1-3 items in 1 group: the item itself plus only truly
    needed companions (e.g. a cable if the charger doesn't include one). No services, no upsells.
  * A big life change (new pet, baby, moving, new hobby setup): 9-12 items in 3-5 need-based groups. The FIRST
    group must address the user's main constraint (e.g. "While you're away" for someone out 10 hours a day,
    "Small-space picks" for a studio) and hold the items that only make sense because of it.
- Include a service (payType "invoice") only when a human service is genuinely useful.
- Products get a precise searchQuery a US online store would match (size, type, key spec), e.g. "42 inch wire dog crate with divider".
- Consumables bought repeatedly are payType "subscription" with cadence "monthly".
- Local recurring or one-off human services (dog walker, vet visit, cleaner, movers) are kind "service", payType "invoice",
  searchQuery "", with a generic provider label. Never invent real business names.
- 1-3 nice-to-have items that can wait get priority "can_wait", payType "watch", and a realistic targetPrice ~15-25% below typical.
- If a budget is given, keep the first-month total (one-time now + first month of recurring) within it when possible.
- Prices are honest US estimates in USD. Price services realistically per visit x visits per month
  (e.g. a 30-minute dog walk is about $20-25, so 5 walks a week is about $400-500/month; a first vet visit with vaccines is about $150-250).
- Only physical products can be "watch". Insurance is a monthly service ("invoice"), not a product.`;

export async function draftPlan(input: {
  prompt: string;
  budget?: number | null;
  imageNote?: string | null;
  qa?: { question: string; answer: string }[];
}): Promise<PlanDraft> {
  const lines = [`User says: """${input.prompt}"""`];
  if (input.budget) lines.push(`First-month budget: $${input.budget}`);
  if (input.imageNote) lines.push(`They also shared a photo. What it shows: ${input.imageNote}`);
  if (input.qa?.length) {
    lines.push("They answered these follow-up questions (treat answers as facts they stated):");
    for (const x of input.qa) lines.push(`- ${x.question} -> ${x.answer}`);
  }

  const { output } = await guardedGroq("agent", 6000, (abortSignal) => generateText({
    abortSignal,
    model: models.agent(),
    system: SYSTEM,
    prompt: lines.join("\n"),
    output: Output.object({ schema: planSchema }),
    temperature: 0.4,
    // gpt-oss is a reasoning model: keep thinking short so the JSON fits the free-tier token budget.
    maxOutputTokens: 5000,
    providerOptions: { groq: { reasoningEffort: "low" } },
    maxRetries: 1,
  }));
  return output;
}

/**
 * Before planning: decide whether a few questions would materially change the plan.
 * Returns 0-3 multiple-choice questions. Zero when the request is already specific.
 */
export async function clarify(input: { prompt: string; budget?: number | null; imageNote?: string | null }) {
  const { output } = await guardedGroq("agent", 2000, (abortSignal) => generateText({
    abortSignal,
    model: models.agent(),
    system: `You help a shopping planner decide what to ask BEFORE building a plan.
Ask only questions whose answers would clearly change WHAT gets bought, HOW MUCH, or WHICH SIZE/TIER.

How many to ask:
- Big, open-ended goals with many possible tiers or components (a computer or gaming setup, a new pet, a baby,
  moving into a home, a home office, a hobby kit): ask 2-3 questions. These plans go wrong without them.
- A single, already-specific item (a named charger, a replacement part, "the same X again"): ask 0, or 1 only if
  a genuinely decisive spec is missing.
- Never ask about anything the user already stated (including the budget if given).

What to ask about, in order of value:
1. What they already own (so we don't re-buy it), e.g. monitor/keyboard for a PC, crate/bed for a pet.
2. Intended use or performance tier (e.g. which games and resolution; puppy vs adult dog).
3. Space or setting constraints (apartment vs house, yard, desk size).
Skip questions that don't change the shopping list (e.g. who does the chores).

Each question: max ~12 words, 2-5 short tap-to-answer options covering common cases. No preamble.

Examples:
- "I want a PC for gaming" -> ask: which games/resolution; do you already have a monitor, keyboard and mouse; prebuilt or custom build.
- "I need a USB-C charger for my iPhone 15" -> ask nothing.`,
    prompt: [
      `User says: """${input.prompt}"""`,
      input.budget ? `Budget given: $${input.budget} for the first month` : "No budget given.",
      input.imageNote ? `Their photo shows: ${input.imageNote}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
    output: Output.object({ schema: clarifySchema }),
    temperature: 0.2,
    maxOutputTokens: 1500,
    providerOptions: { groq: { reasoningEffort: "low" } },
    maxRetries: 1,
  }), 25_000);
  return output.questions.slice(0, 3).map((q, i) => ({ id: `q${i + 1}`, question: q.question, why: q.why, options: q.options.slice(0, 5) }));
}

/** Describe an uploaded photo so the planner can use it (vision model). */
export async function describePhoto(dataUrl: string): Promise<string> {
  const { text } = await guardedGroq("vision", 3000, (abortSignal) => generateText({
    abortSignal,
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
  }), 25_000);
  return text.replace(/\*\*/g, "").trim();
}

/** Pick the offer that genuinely matches each item. */
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

  const { output } = await guardedGroq("agent", 3500, (abortSignal) => generateText({
    abortSignal,
    model: models.agent(),
    system: `You match shopping-list items to store offers. For EVERY item return one choice.
- The offer must be the SAME KIND of product as the item (a monitor is never a keyboard; a bed is never a toy).
- Pick an offer that is the right kind of product. Close variants are fine (different brand, similar size, a combo set, a 15 lb vs 14 lb bag).
- Avoid offers priced more than about 2x the typical price, and accessories/replacement parts instead of the product itself.
- Among acceptable offers, prefer the lower price.
- Use null only when no offer is even the right kind of product.`,
    prompt: listing,
    output: Output.object({ schema: choiceSchema }),
    temperature: 0,
    maxOutputTokens: 2500,
    providerOptions: { groq: { reasoningEffort: "low" } },
    maxRetries: 1,
  }), 35_000);
  return new Map(output.choices.map((c) => [c.item, c.sameKind ? c.offer : null]));
}
