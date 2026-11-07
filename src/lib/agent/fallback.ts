import type { PlanDraft } from "./schemas";

/** Used only when GROQ_API_KEY is missing, so the app still demos end to end. */
export const fallbackPlan: PlanDraft = {
  title: "Your golden retriever plan",
  summary: "You're away about 10 hours on weekdays, so the plan covers care while you're out, then day-one essentials.",
  context: ["Puppy, 8-10 weeks", "Away 9 AM - 7 PM on weekdays", "Apartment"],
  groups: [
    {
      title: "While you're away",
      why: "You're out about 10 hours on weekdays",
      items: [
        { name: "Wi-Fi pet camera with two-way audio", reason: "Check in at lunch and talk to your puppy.", kind: "product", searchQuery: "wifi pet camera two way audio", qty: 1, priority: "now", payType: "order", cadence: "one_time", estimatedPrice: 45, targetPrice: null, provider: "" },
        { name: "Programmable automatic feeder", reason: "Puppies eat 3 times a day; one meal lands while you're out.", kind: "product", searchQuery: "programmable automatic dog feeder", qty: 1, priority: "can_wait", payType: "watch", cadence: "one_time", estimatedPrice: 75, targetPrice: 60, provider: "" },
        { name: "Midday dog walker, 5 days a week", reason: "Puppies can't hold it for 10 hours; a 1 PM walk breaks up the day.", kind: "service", searchQuery: "", qty: 1, priority: "now", payType: "invoice", cadence: "monthly", estimatedPrice: 400, targetPrice: null, provider: "Local dog walker" },
      ],
    },
    {
      title: "Essentials",
      why: "Day-one setup",
      items: [
        { name: "42-inch wire crate with divider", reason: "A safe space while you're out; the divider grows with the puppy.", kind: "product", searchQuery: "42 inch wire dog crate with divider", qty: 1, priority: "now", payType: "order", cadence: "one_time", estimatedPrice: 75, targetPrice: null, provider: "" },
        { name: "Padded leash and adjustable collar", reason: "Needed for every walk.", kind: "product", searchQuery: "padded handle dog leash 6 ft", qty: 1, priority: "now", payType: "order", cadence: "one_time", estimatedPrice: 20, targetPrice: null, provider: "" },
        { name: "Large-breed puppy dry food", reason: "About 3 cups a day, so a bag lasts roughly a month.", kind: "product", searchQuery: "large breed puppy dry dog food", qty: 1, priority: "now", payType: "subscription", cadence: "monthly", estimatedPrice: 60, targetPrice: null, provider: "" },
      ],
    },
    {
      title: "Health",
      why: "First weeks",
      items: [
        { name: "First vet visit and vaccines", reason: "Exam plus the first vaccine round.", kind: "service", searchQuery: "", qty: 1, priority: "now", payType: "invoice", cadence: "one_time", estimatedPrice: 185, targetPrice: null, provider: "Local vet clinic" },
        { name: "Orthopedic dog bed, large", reason: "Sized for an adult golden; worth waiting for a deal.", kind: "product", searchQuery: "orthopedic dog bed large", qty: 1, priority: "can_wait", payType: "watch", cadence: "one_time", estimatedPrice: 70, targetPrice: 55, provider: "" },
      ],
    },
  ],
};
