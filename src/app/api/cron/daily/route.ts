import { isCronAuthorized, runDaily } from "@/lib/cron";
import { appOrigin } from "@/lib/origin";

/**
 * One scheduled job for everything LifeCart does on its own (e.g. a Render cron job, daily at 14:00 UTC):
 *   curl -X POST $APP_URL/api/cron/daily -H "Authorization: Bearer $APPROVAL_SECRET"
 * Checks watched prices, then sends due-bill reminders. At most one WhatsApp digest each, and runs are
 * spaced at least an hour apart.
 */
export async function POST(req: Request) {
  if (!isCronAuthorized(req)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { skipped, result } = await runDaily(appOrigin(req.headers));
  return Response.json({ skipped: skipped ?? null, ...result });
}
