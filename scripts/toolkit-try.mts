// Dev tool: call one PayPal Agent Toolkit tool directly in the sandbox.
// Usage: npx tsx --env-file=.env.local scripts/toolkit-try.mts <tool> '<json args>'
import { PayPalAgentToolkit, ALL_TOOLS_ENABLED } from "@paypal/agent-toolkit/ai-sdk";

const tk = new PayPalAgentToolkit({
  clientId: process.env.PAYPAL_CLIENT_ID!,
  clientSecret: process.env.PAYPAL_CLIENT_SECRET!,
  configuration: { actions: ALL_TOOLS_ENABLED, context: { sandbox: true } },
});
const tools = tk.getTools() as Record<string, { parameters: { safeParse: (x: unknown) => { success: boolean; data?: unknown; error?: { issues: unknown } } }; execute: (args: unknown, opts?: unknown) => Promise<unknown> }>;
const [name, json = "{}"] = process.argv.slice(2);
const tool = tools[name];
const parsed = tool.parameters.safeParse(JSON.parse(json));
if (!parsed.success) {
  console.log("INVALID ARGS:", JSON.stringify(parsed.error?.issues, null, 1).slice(0, 1500));
  process.exit(1);
}
const out = await tool.execute(parsed.data, { toolCallId: "dev", messages: [] });
const full = process.env.FULL === "1";
const text = typeof out === "string" ? out : JSON.stringify(out);
console.log(full ? text : text.slice(0, 2500));
