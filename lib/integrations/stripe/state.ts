import crypto from "crypto";

/**
 * The OAuth `state` passes through Stripe and back to the callback route, so it
 * is signed with AUTH_SECRET (HMAC-SHA256) and verified there. An attacker who
 * completes OAuth for their own Stripe account cannot substitute a victim
 * org's state without invalidating the signature.
 */
function signState(payload: string): string {
  return crypto
    .createHmac("sha256", process.env.AUTH_SECRET!)
    .update(payload)
    .digest("base64url");
}

export function encodeStripeState(payload: object): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${signState(body)}`;
}

export function decodeStripeState(
  state: string
): { orgId: string; userId: string; nonce: string; label?: string } | null {
  const dot = state.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = state.slice(0, dot);
  const sig = state.slice(dot + 1);
  const expected = signState(body);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString());
    if (
      typeof parsed.orgId !== "string" ||
      typeof parsed.userId !== "string" ||
      typeof parsed.nonce !== "string"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
