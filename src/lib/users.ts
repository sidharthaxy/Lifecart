import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";

export async function getUserById(id: string) {
  const db = await getDb();
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, id));
  return u ?? null;
}
