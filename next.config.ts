import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Node-only packages: load with plain require instead of bundling.
  serverExternalPackages: ["@electric-sql/pglite", "@paypal/agent-toolkit", "pg"],
  // Dev only: allow opening the app through `npm run tunnel` (Cloudflare quick tunnel) on a phone.
  allowedDevOrigins: ["*.trycloudflare.com"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
