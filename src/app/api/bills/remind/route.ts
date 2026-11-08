import { timingSafeEqual } from "node:crypto";
import { remindDueBills } from "@/lib/bills";
import { env } from "@/lib/env";
import { appOrigin } from "@/lib/origin";

/**
 * Scheduled bill reminders (e.g. a Render cron job each morning):
 *   curl -X POST $APP_URL/api/bills/remind -H "Authorization: Bearer $APPROVAL_SECRET"
 * Sends at most one WhatsApp digest per run; each bill at most once per 24 hours.
 */
export async function POST(req: Request) {
  const given = Buffer.from(req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "");
  const expected = Buffer.from(env.approvalSecret ?? "");
  if (!expected.length || given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const r = await remindDueBills(appOrigin(req.headers));
  return Response.json({ reminded: r.count, whatsappSent: r.whatsapp?.sent ?? false });
}
