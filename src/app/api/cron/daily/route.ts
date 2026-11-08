import { isCronAuthorized, runDaily } from "@/lib/cron";
import { appOrigin } from "@/lib/origin";
import { startDailyAlerts, workflowsConfigured } from "@/lib/workflows";

/**
 * One scheduled job for everything LifeCart does on its own (a Render cron job, once a day):
 *   curl -X POST $APP_URL/api/cron/daily -H "Authorization: Bearer $APPROVAL_SECRET"
 * Checks watched prices, then sends due-bill reminders, per user (at most one WhatsApp digest each).
 *  - With Render Workflows configured: starts the `dailyAlerts` workflow run and returns its id right away;
 *    the users are checked in parallel tasks with retries (workflows/main.ts). One start per hour at most.
 *  - Otherwise: runs in the app, one user after another, at least an hour apart.
 */
export async function POST(req: Request) {
  if (!isCronAuthorized(req)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const origin = appOrigin(req.headers);
  if (workflowsConfigured()) {
    try {
      const { runId, skipped } = await startDailyAlerts(origin);
      return Response.json({ mode: "render-workflows", runId, skipped: skipped ?? null });
    } catch (e) {
      // Workflows unreachable: fall back to running it here, so alerts still go out today.
      console.error("[cron] Render Workflows start failed, running in the app instead:", (e as Error).message);
    }
  }
  const { skipped, result } = await runDaily(origin);
  return Response.json({ mode: "in-app", skipped: skipped ?? null, ...result });
}
