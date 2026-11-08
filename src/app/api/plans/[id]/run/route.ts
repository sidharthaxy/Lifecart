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
  // If the viewer leaves the page, the stream closes. Planning must NOT fail because of that: we just stop
  // sending progress and let the run finish in the background, so the plan is ready when they come back.
  let open = true;
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (e: StepEvent) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
        } catch {
          open = false;
        }
      };
      try {
        await runPlan(id, emit);
      } finally {
        if (open) {
          try {
            controller.close();
          } catch {
            // already closed by the browser
          }
        }
      }
    },
    cancel() {
      open = false;
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" } });
}
