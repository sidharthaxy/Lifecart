import { eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";

export async function getUserById(id: string) {
  const db = await getDb();
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, id));
  return u ?? null;
}

/**
 * Delete an account and everything in it: plans (with items, offers, watches), bills, payment records, sessions.
 * Blocked while a refills subscription is active, so PayPal can't keep charging an account that no longer exists.
 * Payments themselves stay in PayPal (they're PayPal's records).
 */
export async function deleteAccount(userId: string): Promise<{ ok: true } | { error: string }> {
  const { activeRefills } = await import("./plans");
  if (await activeRefills(userId)) return { error: "You have active monthly refills. Cancel them in Orders & watch first." };
  const db = await getDb();
  const user = await getUserById(userId);
  if (!user) return { error: "Account not found." };
  const approvals = await db.select({ id: schema.approvals.id }).from(schema.approvals).where(eq(schema.approvals.userId, userId));
  if (approvals.length) await db.delete(schema.payments).where(inArray(schema.payments.approvalId, approvals.map((a) => a.id)));
  await db.delete(schema.approvals).where(eq(schema.approvals.userId, userId));
  await db.delete(schema.bills).where(eq(schema.bills.userId, userId));
  await db.delete(schema.goals).where(eq(schema.goals.userId, userId));
  await db.delete(schema.authCodes).where(eq(schema.authCodes.email, user.email));
  await db.delete(schema.users).where(eq(schema.users.id, userId)); // sessions cascade
  return { ok: true };
}
