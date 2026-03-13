/**
 * Cron job script for processing notification digests.
 * Meant to run as a separate Railway cron service every 5 minutes.
 *
 * Required env vars:
 *   APP_URL    - Base URL of the main app (e.g. https://dubbl.up.railway.app)
 *   CRON_SECRET - Shared secret to authenticate with the cron endpoint
 */

export {};

const APP_URL = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL;
const CRON_SECRET = process.env.CRON_SECRET;

if (!APP_URL) {
  console.error("APP_URL or NEXT_PUBLIC_APP_URL env var is required");
  process.exit(1);
}

if (!CRON_SECRET) {
  console.error("CRON_SECRET env var is required");
  process.exit(1);
}

const url = `${APP_URL}/api/cron/notification-digest`;

console.log(`[cron] Hitting ${url}`);

try {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${CRON_SECRET}` },
  });

  const data = await res.json();

  if (!res.ok) {
    console.error(`[cron] Failed with status ${res.status}:`, data);
    process.exit(1);
  }

  console.log("[cron] Done:", data);
} catch (err) {
  console.error("[cron] Request failed:", err);
  process.exit(1);
}
