import { getDb, schema } from "@/db";
import { getDemoUser } from "@/lib/demo-user";

/** JSON way to start a plan (used by tests and, later, WhatsApp replies). */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { prompt?: string; budget?: number };
  const prompt = String(body.prompt ?? "").trim();
  if (prompt.length < 8 || prompt.length > 2000) return Response.json({ error: "prompt must be 8-2000 characters" }, { status: 400 });
  const user = await getDemoUser();
  const db = await getDb();
  const [goal] = await db
    .insert(schema.goals)
    .values({ userId: user.id, prompt, budgetCap: body.budget ? String(body.budget) : null, status: "draft" })
    .returning();
  return Response.json({ id: goal.id, url: `/plans/${goal.id}` }, { status: 201 });
}
