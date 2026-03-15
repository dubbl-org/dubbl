import { db } from "@/lib/db";
import { siteSettings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

type SiteSettingKey =
  | "registration_mode"
  | "allowed_email_domains"
  | "allow_user_org_creation"
  | "self_hosted_unlimited";

const DEFAULTS: Record<SiteSettingKey, string> = {
  registration_mode: "open",
  allowed_email_domains: "",
  allow_user_org_creation: "true",
  self_hosted_unlimited: "auto",
};

const ENV_FALLBACKS: Partial<Record<SiteSettingKey, string>> = {
  registration_mode: "REGISTRATION_MODE",
  allowed_email_domains: "ALLOWED_EMAIL_DOMAINS",
};

// 30-second in-memory cache
const cache = new Map<string, { value: string; expiresAt: number }>();
const CACHE_TTL = 30_000;

export async function getSiteSetting(key: SiteSettingKey): Promise<string> {
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const row = await db.query.siteSettings.findFirst({
    where: eq(siteSettings.key, key),
  });

  if (row) {
    cache.set(key, { value: row.value, expiresAt: Date.now() + CACHE_TTL });
    return row.value;
  }

  // Env var fallback
  const envKey = ENV_FALLBACKS[key];
  if (envKey && process.env[envKey]) {
    return process.env[envKey]!;
  }

  return DEFAULTS[key];
}

export async function setSiteSetting(
  key: SiteSettingKey,
  value: string
): Promise<void> {
  await db
    .insert(siteSettings)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: siteSettings.key,
      set: { value, updatedAt: new Date() },
    });

  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL });
}

export async function getAllSiteSettings(): Promise<
  Record<SiteSettingKey, string>
> {
  const rows = await db.select().from(siteSettings);
  const result = { ...DEFAULTS };

  // Apply env var fallbacks
  for (const [key, envKey] of Object.entries(ENV_FALLBACKS)) {
    if (envKey && process.env[envKey]) {
      result[key as SiteSettingKey] = process.env[envKey]!;
    }
  }

  // DB values override everything
  for (const row of rows) {
    if (row.key in result) {
      result[row.key as SiteSettingKey] = row.value;
    }
  }

  return result;
}

export function isSelfHostedUnlimited(): boolean {
  // Synchronous check using env var directly for performance
  return !process.env.STRIPE_SECRET_KEY;
}
