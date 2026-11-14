import { lookup } from "dns/promises";
import net from "net";

/**
 * Guards outbound requests to user-supplied URLs (webhook endpoints).
 *
 * A webhook target is attacker-chosen and the app POSTs to it from inside the
 * deployment, then hands the response body back to the caller. Without a check
 * that is a read primitive against cloud metadata (169.254.169.254), the
 * internal API port, and anything else on the docker network.
 *
 * Rules: https only, no credentials in the URL, and every address the hostname
 * resolves to must be public. The resolved addresses are returned so the caller
 * can pin them if it wants to defeat DNS rebinding.
 */

const ALLOWED_PROTOCOLS = new Set(["https:"]);

/** True for addresses that are not publicly routable. */
export function isBlockedAddress(address: string): boolean {
  const family = net.isIP(address);
  if (family === 4) {
    const parts = address.split(".").map(Number);
    const [a, b] = parts;
    if (a === 0 || a === 10 || a === 127) return true; // this-host, private, loopback
    if (a === 169 && b === 254) return true; // link-local, incl. cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true; // private
    if (a === 192 && b === 168) return true; // private
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true; // multicast, reserved, broadcast
    return false;
  }
  if (family === 6) {
    const lower = address.toLowerCase();
    if (lower === "::" || lower === "::1") return true;
    if (lower.startsWith("fe80")) return true; // link-local
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // unique-local
    // IPv4-mapped (::ffff:169.254.169.254) — judge the embedded address.
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isBlockedAddress(mapped[1]);
    return false;
  }
  return true; // not an IP at all
}

export class UnsafeUrlError extends Error {}

/**
 * Validate a webhook target before it is stored or called.
 * Throws UnsafeUrlError with a caller-safe message.
 */
export async function assertPublicHttpsUrl(rawUrl: string): Promise<{ url: string; addresses: string[] }> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new UnsafeUrlError("Webhook URL is not a valid URL");
  }
  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    throw new UnsafeUrlError("Webhook URL must use https");
  }
  if (parsed.username || parsed.password) {
    throw new UnsafeUrlError("Webhook URL must not contain credentials");
  }

  const host = parsed.hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(host)) {
    if (isBlockedAddress(host)) {
      throw new UnsafeUrlError("Webhook URL must point at a public address");
    }
    return { url: parsed.toString(), addresses: [host] };
  }

  let resolved: { address: string }[];
  try {
    resolved = await lookup(host, { all: true });
  } catch {
    throw new UnsafeUrlError("Webhook URL host could not be resolved");
  }
  if (resolved.length === 0) {
    throw new UnsafeUrlError("Webhook URL host could not be resolved");
  }
  if (resolved.some((r) => isBlockedAddress(r.address))) {
    throw new UnsafeUrlError("Webhook URL must point at a public address");
  }
  return { url: parsed.toString(), addresses: resolved.map((r) => r.address) };
}
