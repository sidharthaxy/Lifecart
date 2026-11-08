/**
 * Central place to read environment variables and decide, per integration,
 * whether LifeCart runs it LIVE (key present) or in MOCK mode (key missing).
 * Server-only: never import this from a client component.
 */

const read = (name: string): string | undefined => {
  const v = process.env[name]?.trim();
  return v ? v : undefined;
};

export const env = {
  appUrl: read("APP_URL") ?? "http://localhost:3000",
  approvalSecret: read("APPROVAL_SECRET"),

  aiProvider: (read("AI_PROVIDER") ?? "groq") as "groq",
  groqApiKey: read("GROQ_API_KEY"),

  paypalEnv: (read("PAYPAL_ENVIRONMENT") ?? "sandbox") as "sandbox" | "live",
  paypalClientId: read("PAYPAL_CLIENT_ID"),
  paypalClientSecret: read("PAYPAL_CLIENT_SECRET"),
  paypalWebhookId: read("PAYPAL_WEBHOOK_ID"),

  whatsappProvider: (read("WHATSAPP_PROVIDER") ?? "twilio") as "twilio" | "meta",
  whatsappToken: read("WHATSAPP_TOKEN"),
  whatsappPhoneNumberId: read("WHATSAPP_PHONE_NUMBER_ID"),
  whatsappAppSecret: read("WHATSAPP_APP_SECRET"),
  whatsappVerifyToken: read("WHATSAPP_VERIFY_TOKEN"),
  demoWhatsappTo: read("DEMO_WHATSAPP_TO"),

  channel3ApiKey: read("CHANNEL3_API_KEY"),
  kernelApiKey: read("KERNEL_API_KEY"),

  databaseUrl: read("DATABASE_URL"),

  twilioSid: read("TWILIO_ACCOUNT_SID"),
  twilioToken: read("TWILIO_AUTH_TOKEN"),
  twilioFrom: read("TWILIO_FROM"),

  gmailUser: read("GMAIL_USER"),
  gmailAppPassword: read("GMAIL_APP_PASSWORD")?.replace(/\s+/g, ""),
};

export type IntegrationStatus = {
  key: string;
  name: string;
  live: boolean;
  missing: string[];
  mockNote: string;
};

const check = (
  key: string,
  name: string,
  vars: Record<string, string | undefined>,
  mockNote: string,
): IntegrationStatus => {
  const missing = Object.entries(vars)
    .filter(([, v]) => !v)
    .map(([k]) => k);
  return { key, name, live: missing.length === 0, missing, mockNote };
};

export function integrations(): IntegrationStatus[] {
  return [
    check("ai", "Groq AI", { GROQ_API_KEY: env.groqApiKey }, "Plans come from a canned golden-retriever example."),
    check(
      "paypal",
      "PayPal sandbox",
      {
        PAYPAL_CLIENT_ID: env.paypalClientId,
        PAYPAL_CLIENT_SECRET: env.paypalClientSecret,
        NEXT_PUBLIC_PAYPAL_CLIENT_ID: process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID,
      },
      "Payments are simulated; no PayPal button is shown.",
    ),
    env.whatsappProvider === "meta"
      ? check(
          "whatsapp",
          "WhatsApp (Meta Cloud API)",
          {
            WHATSAPP_TOKEN: env.whatsappToken,
            WHATSAPP_PHONE_NUMBER_ID: env.whatsappPhoneNumberId,
            DEMO_WHATSAPP_TO: env.demoWhatsappTo,
          },
          "Messages appear in the on-screen phone preview instead.",
        )
      : check(
          "whatsapp",
          "WhatsApp (Twilio sandbox)",
          {
            TWILIO_ACCOUNT_SID: env.twilioSid,
            TWILIO_AUTH_TOKEN: env.twilioToken,
            TWILIO_FROM: env.twilioFrom,
            DEMO_WHATSAPP_TO: env.demoWhatsappTo,
          },
          "Messages appear in the on-screen phone preview instead.",
        ),
    check("channel3", "Channel3 products", { CHANNEL3_API_KEY: env.channel3ApiKey }, "Offers come from the seeded catalog."),
    check("kernel", "Kernel browser", { KERNEL_API_KEY: env.kernelApiKey }, "Coupons come from the seeded coupon list."),
    check("db", "Postgres", { DATABASE_URL: env.databaseUrl }, "Using the embedded local Postgres in ./.data (fine for dev)."),
  ];
}

export const isLive = (key: string) => integrations().find((i) => i.key === key)?.live ?? false;
