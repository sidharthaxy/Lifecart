// Dev tool: trigger the dailyAlerts workflow exactly like /api/cron/daily does, then wait for the result.
// Needs the local task server: render workflows dev --env-file .env.local -- npx tsx workflows/main.ts
// Usage: RENDER_USE_LOCAL_DEV=true npx tsx --env-file=.env.local scripts/workflow-test.mts
import { Render } from "@renderinc/sdk";
import { startDailyAlerts, workflowsConfigured } from "../src/lib/workflows";

const ok = (cond: boolean, what: string) => console.log(`${cond ? "PASS" : "FAIL"}  ${what}`);
ok(workflowsConfigured(), "workflows configured (local dev)");
const t0 = Date.now();
const { runId } = await startDailyAlerts(process.env.APP_URL ?? "http://localhost:3000");
console.log("started run", runId);

const render = new Render({ useLocalDev: true });
let run = await render.workflows.getTaskRun(runId);
while (!["completed", "succeeded", "failed", "canceled", "cancelled"].includes(String(run.status).toLowerCase()) && Date.now() - t0 < 300_000) {
  await new Promise((r) => setTimeout(r, 2000));
  run = await render.workflows.getTaskRun(runId);
}
console.log(`status ${run.status} after ${((Date.now() - t0) / 1000).toFixed(0)}s`);
console.log("result:", JSON.stringify(run.results ?? run.error, null, 1)?.slice(0, 800));
ok(/complete|succe/i.test(String(run.status)), "dailyAlerts finished");

const children = await render.workflows.listTaskRuns({ rootTaskRunId: runId } as never).catch(() => null);
const list = (children as unknown as { items?: { taskId: string; status: string }[] } | { taskId: string; status: string }[] | null) ?? [];
const items = Array.isArray(list) ? list : (list.items ?? []);
if (items.length) console.log(`runs in this tree: ${items.length} (${[...new Set(items.map((i) => i.status))].join(", ")})`);

// Same hour, same idempotency key: a second trigger must not start a second run.
const again = await startDailyAlerts(process.env.APP_URL ?? "http://localhost:3000");
ok(again.runId === runId, `second trigger in the same hour reuses the run (${again.runId === runId ? "same id" : again.runId})`);
process.exit(0);
