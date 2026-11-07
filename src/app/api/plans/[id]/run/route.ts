import { runPlan, type StepEvent } from "@/lib/agent/run";

/** Runs the planning agent and streams its steps as newline-delimited JSON. */
export async function POST(_req: Request, ctx: RouteContext<"/api/plans/[id]/run">) {
  const { id } = await ctx.params;
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
