import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { and, eq, gt, lt } from "drizzle-orm";
import { getDb, schema } from "@/db";

export type User = typeof schema.users.$inferSelect;

const COOKIE = "lc_session";
const TTL_MS = 30 * 24 * 60 * 60_000; // 30 days
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

/** Start a session for a verified user and set the cookie (call from a Server Action). */
export async function startSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + TTL_MS);
  const db = await getDb();
  await db.insert(schema.sessions).values({ tokenHash: sha(token), userId, expiresAt });
  // Housekeeping: drop expired sessions now and then.
  if (Math.random() < 0.1) await db.delete(schema.sessions).where(lt(schema.sessions.expiresAt, new Date()));
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

/** The signed-in user, or null. Memoized per request. */
export const getSessionUser = cache(async (): Promise<User | null> => {
  await connection(); // request-time only (it compares against the current time)
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token || token.length > 100) return null;
  const db = await getDb();
  const [row] = await db
    .select({ user: schema.users })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .where(and(eq(schema.sessions.tokenHash, sha(token)), gt(schema.sessions.expiresAt, new Date())))
    .limit(1);
  return row?.user ?? null;
});

/** Pages: signed in AND finished the welcome questions, or redirect. */
export async function requireUser(): Promise<User> {
  const user = await getSessionUser();
  if (!user) redirect("/");
  if (!user.onboardedAt) redirect("/welcome");
  return user;
}

/** Server Actions / route handlers: the user, or null (never redirects). */
export async function actionUser(): Promise<User | null> {
  const user = await getSessionUser();
  return user?.onboardedAt ? user : null;
}

export async function endSession({ everywhere = false } = {}) {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  const db = await getDb();
  if (token) {
    if (everywhere) {
      const user = await getSessionUser();
      if (user) await db.delete(schema.sessions).where(eq(schema.sessions.userId, user.id));
    } else await db.delete(schema.sessions).where(eq(schema.sessions.tokenHash, sha(token)));
  }
  jar.delete(COOKIE);
}

export const SESSION_COOKIE = COOKIE;
