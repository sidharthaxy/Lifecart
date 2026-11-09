/**
 * LifeCart on Render Workflows: the daily alerts job, run as distributed tasks.
 *
 *   dailyAlerts(origin)          root task, started by /api/cron/daily (Render cron job, once a day)
 *     └─ checkUser(origin, id)   one run per user, on its own compute, retried on failure
 *                                (price watch -> one WhatsApp digest; bills due -> one WhatsApp digest)
 *
 * Users are checked in parallel batches of 10 so the shared Channel3 and Twilio budgets aren't hammered.
 * Each checkUser run uses the same code as the in-app path (src/lib/cron.ts), so behaviour is identical, and the
 * per-item cooldowns + daily usage caps in the database protect against double sends even if a run is retried.
 *
 * Deploy: the `lifecart-workflows` service in render.yaml (build `npm ci`, start `npm run workflows`; its keys are
 *   copied from the web service).
 * Local: npm run workflows:dev  (render workflows dev --env-file .env.local -- npx tsx workflows/main.ts)
 *   (the task server starts automatically when Render sets RENDER_SDK_SOCKET_PATH)
 */
import { task, type TaskContext } from "@renderinc/sdk/workflows";
import { checkUserDaily, dailyUserIds, summarize, type UserDailyResult } from "../src/lib/cron";

const BATCH = 10;

export const checkUser = task(
  {
    name: "checkUser",
    retry: { maxRetries: 2, waitDurationMs: 30_000, backoffScaling: 2 },
    timeoutSeconds: 300,
  },
  async function checkUser(_ctx: TaskContext, origin: string, userId: string): Promise<UserDailyResult> {
    return checkUserDaily(origin, userId);
  },
);

task(
  { name: "dailyAlerts", timeoutSeconds: 3600 },
  async function dailyAlerts(ctx: TaskContext, origin: string) {
    if (typeof origin !== "string" || !/^https?:\/\/[^\s]+$/.test(origin)) throw new Error("dailyAlerts needs the app's URL, e.g. https://lifecart.onrender.com");
    const ids = await dailyUserIds();
    const results: (UserDailyResult | { userId: string; failed: string })[] = [];
    for (let i = 0; i < ids.length; i += BATCH) {
      const batch = ids.slice(i, i + BATCH);
      const settled = await Promise.allSettled(batch.map((id) => ctx.run(checkUser, origin, id)));
      settled.forEach((s, j) => results.push(s.status === "fulfilled" ? s.value : { userId: batch[j], failed: String(s.reason).slice(0, 200) }));
    }
    return summarize(results);
  },
);
