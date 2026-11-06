import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  AUTH_SECRET: z.string().min(1),
  AUTH_URL: z.string().url().optional(),
  STRIPE_SECRET_KEY: z.string().min(1).optional(),
  STRIPE_WEBHOOK_SECRET: z.string().min(1).optional(),
  STRIPE_STANDARD_PRICE_ID: z.string().min(1).optional(),
  STRIPE_STANDARD_ANNUAL_PRICE_ID: z.string().min(1).optional(),
  STRIPE_PREMIUM_PRICE_ID: z.string().min(1).optional(),
  STRIPE_PREMIUM_ANNUAL_PRICE_ID: z.string().min(1).optional(),
  STRIPE_ULTIMATE_PRICE_ID: z.string().min(1).optional(),
  STRIPE_ULTIMATE_ANNUAL_PRICE_ID: z.string().min(1).optional(),
  // Legacy names, read as a fallback for Standard
  STRIPE_PRO_PRICE_ID: z.string().min(1).optional(),
  STRIPE_PRO_ANNUAL_PRICE_ID: z.string().min(1).optional(),
  S3_ENDPOINT: z.string().url().optional(),
  S3_REGION: z.string().default("us-east-1"),
  S3_ACCESS_KEY_ID: z.string().min(1).optional(),
  S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  S3_BUCKET: z.string().default("dubbl"),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  // Tilly, the in-app assistant, via OpenRouter (switched off without a key)
  OPENROUTER_API_KEY: z.string().min(1).optional(),
  OPENROUTER_BASE_URL: z.string().url().optional(),
  ASSISTANT_MODEL: z.string().min(1).default("openai/gpt-6-luna"),
  ASSISTANT_REASONING_EFFORT: z.string().min(1).optional(),
});

export const env = envSchema.parse(process.env);
