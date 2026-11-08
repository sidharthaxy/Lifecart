import { actionUser } from "@/lib/auth/session";
import { createGoalSafely } from "@/lib/goals";

/** JSON way to start a plan (signed-in session required). Same guardrails as the web form. */
export async function POST(req: Request) {
  const user = await actionUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { prompt?: unknown; budget?: unknown };
  const res = await createGoalSafely({ prompt: body.prompt, budget: body.budget, client: user.id, userId: user.id });
  if ("error" in res) return Response.json(res, { status: 422 });
  return Response.json({ id: res.id, url: `/plans/${res.id}` }, { status: 201 });
}
