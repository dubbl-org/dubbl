import { SignJWT, importPKCS8 } from "jose";

/**
 * Generate an Apple client secret JWT at runtime from a base64-encoded .p8 key.
 *
 * Apple client secrets are short-lived JWTs (max 6 months) signed with your
 * private key. Instead of pre-generating and rotating them, we generate on
 * demand from env vars:
 *
 *   AUTH_APPLE_KEY_BASE64  - Base64-encoded contents of the .p8 file
 *   AUTH_APPLE_KEY_ID      - 10-char Key ID from Apple Developer portal
 *   AUTH_APPLE_TEAM_ID     - 10-char Team ID from Apple Developer portal
 *   AUTH_APPLE_ID          - Service ID (client_id)
 *
 * To encode your .p8 file:
 *   base64 -w0 AuthKey_XXXXXXXXXX.p8
 */

let cachedSecret: { jwt: string; expiresAt: number } | null = null;

export async function getAppleClientSecret(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  // Return cached secret if still valid (with 5 min buffer)
  if (cachedSecret && cachedSecret.expiresAt > now + 300) {
    return cachedSecret.jwt;
  }

  const keyBase64 = process.env.AUTH_APPLE_KEY_BASE64;
  const keyId = process.env.AUTH_APPLE_KEY_ID;
  const teamId = process.env.AUTH_APPLE_TEAM_ID;
  const clientId = process.env.AUTH_APPLE_ID;

  if (!keyBase64 || !keyId || !teamId || !clientId) {
    throw new Error(
      "Apple Sign-In requires AUTH_APPLE_KEY_BASE64, AUTH_APPLE_KEY_ID, AUTH_APPLE_TEAM_ID, and AUTH_APPLE_ID"
    );
  }

  const keyPem = Buffer.from(keyBase64, "base64").toString("utf-8");
  const privateKey = await importPKCS8(keyPem, "ES256");

  // Apple allows max 6 months, we use 5 months for safety
  const expiresAt = now + 60 * 60 * 24 * 150; // 150 days

  const jwt = await new SignJWT({})
    .setAudience("https://appleid.apple.com")
    .setIssuer(teamId)
    .setSubject(clientId)
    .setIssuedAt(now)
    .setExpirationTime(expiresAt)
    .setProtectedHeader({ alg: "ES256", kid: keyId })
    .sign(privateKey);

  cachedSecret = { jwt, expiresAt };
  return jwt;
}
