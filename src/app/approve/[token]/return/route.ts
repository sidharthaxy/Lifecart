import { handleReturn } from "@/lib/approvals";
import { appOrigin } from "@/lib/origin";

/** PayPal redirects the buyer here after approving an order or subscription. */
export async function GET(req: Request, ctx: RouteContext<"/approve/[token]/return">) {
  const { token } = await ctx.params;
  const url = new URL(req.url);
  const origin = appOrigin(req.headers);
  const next = await handleReturn(token, url.searchParams.get("step") ?? "", url.searchParams, origin);
  return Response.redirect(next, 303);
}
