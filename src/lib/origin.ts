import { env } from "./env";

/**
 * Public base URL for links we send out (WhatsApp, PayPal return URLs).
 * APP_URL wins when it's a real public URL (tunnel or deploy); otherwise use the host the request came in on.
 */
export function appOrigin(h: Headers): string {
  // Read live so editing APP_URL in .env.local (e.g. a new tunnel URL) applies without a restart.
  const configured = process.env.APP_URL?.trim() || env.appUrl;
  if (configured && !/localhost|127\.0\.0\.1/.test(configured)) return configured.replace(/\/$/, "");
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
