// In-memory sliding-window rate limiter for auth-sensitive endpoints.
// shortcut: per-instance state only — adequate for the single-container
// deployment; move to Redis/shared store when running multiple replicas.
const buckets = new Map<string, number[]>();

// Periodic sweep so dead keys don't accumulate forever.
const SWEEP_INTERVAL = 10 * 60 * 1000;
let lastSweep = Date.now();

function sweep(now: number, windowMs: number) {
  if (now - lastSweep < SWEEP_INTERVAL) return;
  lastSweep = now;
  for (const [key, hits] of buckets) {
    const alive = hits.filter((t) => now - t < windowMs);
    if (alive.length === 0) buckets.delete(key);
    else buckets.set(key, alive);
  }
}

/**
 * Returns true if the request is allowed. Records the hit otherwise.
 * limit: max requests per windowMs per key.
 */
export function rateLimit(key: string, limit: number, windowMs = 15 * 60 * 1000): boolean {
  const now = Date.now();
  sweep(now, windowMs);
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) {
    buckets.set(key, hits);
    return false;
  }
  hits.push(now);
  buckets.set(key, hits);
  return true;
}

/** Best-effort client IP from proxy headers (behind Cloudflare Tunnel). */
export function clientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}
