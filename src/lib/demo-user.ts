import { getDb, schema } from "@/db";
import { env } from "./env";

/** Single demo user for the hackathon build (no auth). */
export async function getDemoUser() {
  const db = await getDb();
  const [existing] = await db.select().from(schema.users).limit(1);
  if (existing) return existing;
  const [created] = await db
    .insert(schema.users)
    .values({
      name: "Jordan Lee",
      phone: env.demoWhatsappTo ?? null,
      whatsappOptIn: Boolean(env.demoWhatsappTo),
      shipTo: "Jordan Lee, 210 Maple Ct, Apt 4B",
    })
    .returning();
  return created;
}
