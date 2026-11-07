import { createGoalSafely } from "@/lib/goals";
import { clientKey } from "@/lib/guard/ratelimit";

/** JSON way to start a plan (tests and, later, WhatsApp replies). Same guardrails as the web form. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { prompt?: unknown; budget?: unknown };
  const res = await createGoalSafely({ prompt: body.prompt, budget: body.budget, client: clientKey(req.headers) });
  if ("error" in res) return Response.json(res, { status: 422 });
  return Response.json({ id: res.id, url: `/plans/${res.id}` }, { status: 201 });
}
