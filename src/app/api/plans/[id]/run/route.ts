import { runPlan, type StepEvent } from "@/lib/agent/run";
import { actionUser } from "@/lib/auth/session";
import { ownsGoal } from "@/lib/plans";

/** Runs the planning agent and streams its steps as newline-delimited JSON. */
export async function POST(_req: Request, ctx: RouteContext<"/api/plans/[id]/run">) {
  const { id } = await ctx.params;
  const user = await actionUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });
  if (!/^[0-9a-f-]{36}$/.test(id) || !(await ownsGoal(id, user.id))) return Response.json({ error: "Plan not found" }, { status: 404 });
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (e: StepEvent) => controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      try {
        await runPlan(id, emit);
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" } });
}
