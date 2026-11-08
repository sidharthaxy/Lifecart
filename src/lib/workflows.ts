import { Render } from "@renderinc/sdk";

/**
 * Hand the daily job to Render Workflows (see workflows/main.ts).
 * Configured when RENDER_API_KEY and RENDER_WORKFLOW_SLUG are set, or RENDER_USE_LOCAL_DEV=true for the local
 * task server (`render workflows dev`). Otherwise the app runs the job itself (lib/cron.ts runDaily).
 */
const slug = () => process.env.RENDER_WORKFLOW_SLUG?.trim() || null;
const localDev = () => /^(1|t|true)$/i.test(process.env.RENDER_USE_LOCAL_DEV ?? "");

export const workflowsConfigured = () => localDev() || Boolean(process.env.RENDER_API_KEY?.trim() && slug());

// At most one start per hour: our own guard (the web service is a single instance), plus Render's idempotency key.
const MIN_GAP_MS = 60 * 60_000;
let lastStart: { at: number; runId: string } | null = null;

/** Start the dailyAlerts run (fire and forget). Returns the earlier run instead if one started within the hour. */
export async function startDailyAlerts(origin: string): Promise<{ runId: string; skipped?: string }> {
  if (lastStart && Date.now() - lastStart.at < MIN_GAP_MS) return { runId: lastStart.runId, skipped: "started less than an hour ago" };
  const render = new Render(localDev() ? { useLocalDev: true } : {});
  const name = slug() ? `${slug()}/dailyAlerts` : "dailyAlerts";
  const hour = new Date().toISOString().slice(0, 13); // e.g. 2026-11-09T14
  const run = await render.workflows.startTask(name, [origin], { idempotencyKey: `lifecart-daily-${hour}` });
  lastStart = { at: Date.now(), runId: run.taskRunId };
  return { runId: run.taskRunId };
}
