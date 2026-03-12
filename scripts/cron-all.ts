/**
 * Unified cron job script that hits all cron endpoints in parallel.
 * Runs as a single Railway cron service every 5 minutes.
 *
 * Required env vars:
 *   APP_URL     - Base URL of the main app (e.g. https://dubbl.up.railway.app)
 *   CRON_SECRET - Shared secret to authenticate with the cron endpoints
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

const ENDPOINTS = [
  "/api/cron/notification-digest",
  "/api/cron/webhook-retries",
  "/api/cron/report-schedules",
];

const headers = { Authorization: `Bearer ${CRON_SECRET}` };

const results = await Promise.allSettled(
  ENDPOINTS.map(async (endpoint) => {
    const url = `${APP_URL}${endpoint}`;
    console.log(`[cron] Hitting ${url}`);
    const res = await fetch(url, { headers });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(`${endpoint} failed (${res.status}): ${JSON.stringify(data)}`);
    }
    console.log(`[cron] ${endpoint} done:`, data);
    return data;
  })
);

let failed = false;
for (let i = 0; i < results.length; i++) {
  const result = results[i];
  if (result.status === "rejected") {
    console.error(`[cron] ${ENDPOINTS[i]} error:`, result.reason);
    failed = true;
  }
}

if (failed) {
  process.exit(1);
}
