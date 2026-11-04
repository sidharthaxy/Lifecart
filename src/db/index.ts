import { env } from "@/lib/env";
import * as schema from "./schema";

/**
 * DATABASE_URL set → real Postgres (Render) via node-postgres.
 * DATABASE_URL blank → embedded Postgres (PGlite) stored in ./.data/pglite.
 * Both use the same pg schema, so nothing else changes.
 */
async function create() {
  if (env.databaseUrl) {
    const { drizzle } = await import("drizzle-orm/node-postgres");
    return drizzle({ connection: env.databaseUrl, schema });
  }
  const { mkdirSync } = await import("node:fs");
  mkdirSync("./.data", { recursive: true });
  const { drizzle } = await import("drizzle-orm/pglite");
  return drizzle({ connection: { dataDir: "./.data/pglite" }, schema });
}

type DB = Awaited<ReturnType<typeof create>>;
const g = globalThis as unknown as { __lifecartDb?: Promise<DB> };

/** Reuse one connection across hot reloads in dev. */
export const getDb = (): Promise<DB> => (g.__lifecartDb ??= create());
export { schema };
