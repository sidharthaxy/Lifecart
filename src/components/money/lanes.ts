// Categorical order validated with the dataviz palette checker (light surface): payments, bills, renewals, refunds.
export const CALENDAR_LANES = [
  { id: "payments", name: "Payments made", eventColor: "#3B5BDB" },
  { id: "bills", name: "Bills due", eventColor: "#D9480F" },
  { id: "renewals", name: "Refill renewals", eventColor: "#8B5CF6" },
  { id: "refunds", name: "Refunds", eventColor: "#0F9488" },
] as const;
