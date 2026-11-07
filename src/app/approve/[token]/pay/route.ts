import { startPayment } from "@/lib/approvals";
import { allow, clientKey } from "@/lib/guard/ratelimit";
import { appOrigin } from "@/lib/origin";

/** "Continue with PayPal" (form POST, so link prefetchers can never start a payment). */
export async function POST(req: Request, ctx: RouteContext<"/approve/[token]/pay">) {
  const { token } = await ctx.params;
  const origin = appOrigin(req.headers);
  const rl = allow(`pay:${clientKey(req.headers)}`, 20, 10 * 60_000);
  if (!rl.ok) return Response.redirect(`${origin}/approve/${token}?error=1`, 303);
  const res = await startPayment(token, origin);
  return Response.redirect("redirect" in res ? res.redirect : `${origin}/approve/${token}?error=1`, 303);
}
