// Dev tool: lists PayPal Agent Toolkit tools and their parameter keys. Usage: npx tsx --env-file=.env.local scripts/toolkit-inspect.mts [toolName]
import { PayPalAgentToolkit, ALL_TOOLS_ENABLED } from "@paypal/agent-toolkit/ai-sdk";

const tk = new PayPalAgentToolkit({
  clientId: process.env.PAYPAL_CLIENT_ID!,
  clientSecret: process.env.PAYPAL_CLIENT_SECRET!,
  configuration: { actions: ALL_TOOLS_ENABLED, context: { sandbox: true } },
});
const tools = tk.getTools() as Record<string, { description?: string; parameters?: { shape?: Record<string, unknown>; _def?: { shape?: () => Record<string, unknown> } }; execute?: unknown }>;
const only = process.argv[2];
for (const [name, t] of Object.entries(tools)) {
  if (only && name !== only) continue;
  const shape = t.parameters?.shape ?? t.parameters?._def?.shape?.() ?? {};
  console.log(`${name}: ${Object.keys(shape).join(", ")}${typeof t.execute === "function" ? "" : "  (no execute!)"}`);
  if (only) {
    const describe = (v: unknown, depth = 0): string => {
      const d = (v as { _def?: { typeName?: string; description?: string; shape?: () => Record<string, unknown>; innerType?: unknown; type?: unknown } })?._def;
      if (!d || depth > 4) return "";
      const inner = d.innerType ?? (d.typeName === "ZodArray" ? d.type : undefined);
      if (d.typeName === "ZodObject" && d.shape)
        return "{ " + Object.entries(d.shape()).map(([k, s]) => `${k}: ${describe(s, depth + 1)}`).join(", ") + " }";
      if (inner) return `${d.typeName?.replace("Zod", "")}<${describe(inner, depth + 1)}>`;
      return d.typeName?.replace("Zod", "") ?? "?";
    };
    for (const [k, v] of Object.entries(shape)) console.log(`  ${k}: ${describe(v)}`);
    console.log("  desc:", t.description?.slice(0, 400));
  }
}
