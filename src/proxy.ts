import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic auth check: app pages need a session cookie, otherwise go to the sign-in page (/).
 * The real check (is the session valid, does this plan belong to you) happens on the server in every page,
 * action and route via lib/auth/session.ts. Payment links (/approve/...) stay public: they're single-use tokens
 * opened from WhatsApp, often on a phone that isn't signed in.
 */
export function proxy(req: NextRequest) {
  if (!req.cookies.get("lc_session")?.value) return NextResponse.redirect(new URL("/", req.url));
  return NextResponse.next();
}

export const config = {
  matcher: ["/plans/:path*", "/bills/:path*", "/orders/:path*", "/money/:path*", "/profile/:path*", "/welcome/:path*", "/setup/:path*"],
};
