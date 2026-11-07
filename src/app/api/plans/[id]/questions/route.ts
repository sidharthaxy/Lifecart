import { getOrAskQuestions, saveAnswers } from "@/lib/agent/clarify";
import { allow, clientKey, LIMITS } from "@/lib/guard/ratelimit";

const isId = (s: string) => /^[0-9a-f-]{36}$/.test(s);

/** Ask (or return cached) clarifying questions for a plan. */
export async function POST(_req: Request, ctx: RouteContext<"/api/plans/[id]/questions">) {
  const { id } = await ctx.params;
  if (!isId(id)) return Response.json({ error: "Plan not found" }, { status: 404 });
  const res = await getOrAskQuestions(id);
  if (!res) return Response.json({ error: "Plan not found" }, { status: 404 });
  if ("blocked" in res) return Response.json(res, { status: 422 });
  return Response.json(res);
}

/** Save the user's answers ({} = skipped). */
export async function PUT(req: Request, ctx: RouteContext<"/api/plans/[id]/questions">) {
  const { id } = await ctx.params;
  if (!isId(id)) return Response.json({ error: "Plan not found" }, { status: 404 });
  const rl = allow(`answers:${clientKey(req.headers)}`, LIMITS.answers.limit, LIMITS.answers.windowMs);
  if (!rl.ok) return Response.json({ error: "Too many attempts. Please wait a few minutes." }, { status: 429 });
  const body = (await req.json().catch(() => ({}))) as { answers?: Record<string, string> };
  const res = await saveAnswers(id, body.answers && typeof body.answers === "object" ? body.answers : {});
  if ("error" in res) return Response.json(res, { status: 422 });
  return Response.json({ ok: true });
}
