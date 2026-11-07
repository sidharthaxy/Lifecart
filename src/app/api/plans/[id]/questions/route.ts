import { getOrAskQuestions, saveAnswers } from "@/lib/agent/clarify";

/** Ask (or return cached) clarifying questions for a plan. */
export async function POST(_req: Request, ctx: RouteContext<"/api/plans/[id]/questions">) {
  const { id } = await ctx.params;
  const questions = await getOrAskQuestions(id);
  if (!questions) return Response.json({ error: "Plan not found" }, { status: 404 });
  return Response.json({ questions });
}

/** Save the user's answers ({} = skipped). */
export async function PUT(req: Request, ctx: RouteContext<"/api/plans/[id]/questions">) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { answers?: Record<string, string> };
  await saveAnswers(id, body.answers ?? {});
  return Response.json({ ok: true });
}
