import { timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { appOrigin } from "@/lib/origin";
import { checkWatches } from "@/lib/watch";

/**
 * Scheduled price check (e.g. a Render cron job every 6 hours):
 *   curl -X POST $APP_URL/api/watch/check -H "Authorization: Bearer $APPROVAL_SECRET"
 */
export async function POST(req: Request) {
  const given = Buffer.from(req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "");
  const expected = Buffer.from(env.approvalSecret ?? "");
  if (!expected.length || given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const { results, whatsapp } = await checkWatches(appOrigin(req.headers));
  return Response.json({
    checked: results.length,
    alerts: results.filter((r) => r.status === "hit").map((r) => ({ item: r.name, now: r.now, target: r.target })),
    whatsappSent: whatsapp?.sent ?? false,
  });
}
