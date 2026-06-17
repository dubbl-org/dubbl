import { createHmac, randomBytes, timingSafeEqual } from "crypto";

// Minimal RFC 6238 (TOTP) / RFC 4226 (HOTP) implementation using Node crypto.
// No external dependency. Defaults match Google Authenticator / Authy:
// SHA-1, 6 digits, 30-second period.

const DIGITS = 6;
const PERIOD = 30; // seconds
const ALGORITHM = "sha1";
// How many adjacent windows to accept (clock drift tolerance), +/- N steps.
const WINDOW = 1;

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** Encode raw bytes to RFC 4648 base32 (no padding). */
export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (let i = 0; i < buf.length; i++) {
    value = (value << 8) | buf[i];
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return out;
}

/** Decode an RFC 4648 base32 string (padding/whitespace tolerant) to bytes. */
export function base32Decode(input: string): Buffer {
  const clean = input.replace(/=+$/g, "").replace(/\s+/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx === -1) throw new Error("Invalid base32 character");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** Generate a new random base32 TOTP secret (20 bytes = 160 bits). */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

/** Compute the HOTP/TOTP code for a given counter value. */
function generateHotp(secret: Buffer, counter: number): string {
  // 8-byte big-endian counter. The TOTP counter (unix/30s) stays well within
  // Number.MAX_SAFE_INTEGER for centuries, so plain arithmetic is safe and
  // avoids BigInt (which requires an ES2020+ target).
  const buf = Buffer.alloc(8);
  let c = counter;
  for (let i = 7; i >= 0; i--) {
    buf[i] = c & 0xff;
    c = Math.floor(c / 256);
  }
  const hmac = createHmac(ALGORITHM, secret).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  const otp = binary % 10 ** DIGITS;
  return otp.toString().padStart(DIGITS, "0");
}

/** Generate the current TOTP code for a base32 secret. */
export function generateTotp(secretBase32: string, atMs = Date.now()): string {
  const secret = base32Decode(secretBase32);
  const counter = Math.floor(atMs / 1000 / PERIOD);
  return generateHotp(secret, counter);
}

/**
 * Verify a user-supplied TOTP code against a base32 secret, tolerating +/- WINDOW
 * time steps for clock drift. Constant-time per-candidate comparison.
 */
export function verifyTotp(
  secretBase32: string,
  token: string,
  atMs = Date.now()
): boolean {
  const normalized = (token || "").replace(/\s+/g, "");
  if (!/^\d{6}$/.test(normalized)) return false;
  let secret: Buffer;
  try {
    secret = base32Decode(secretBase32);
  } catch {
    return false;
  }
  const counter = Math.floor(atMs / 1000 / PERIOD);
  const candidate = Buffer.from(normalized);
  for (let i = -WINDOW; i <= WINDOW; i++) {
    const expected = Buffer.from(generateHotp(secret, counter + i));
    if (
      expected.length === candidate.length &&
      timingSafeEqual(expected, candidate)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Build the otpauth:// URI consumed by authenticator apps to provision the
 * secret (also what a QR code would encode).
 */
export function buildOtpAuthUri(params: {
  secret: string;
  accountName: string;
  issuer: string;
}): string {
  const label = encodeURIComponent(`${params.issuer}:${params.accountName}`);
  const query = new URLSearchParams({
    secret: params.secret,
    issuer: params.issuer,
    algorithm: ALGORITHM.toUpperCase(),
    digits: String(DIGITS),
    period: String(PERIOD),
  });
  return `otpauth://totp/${label}?${query.toString()}`;
}

/**
 * Generate a set of human-friendly single-use backup codes. Returns both the
 * plaintext codes (shown once to the user) and their hashed form (stored).
 */
export function generateBackupCodes(count = 10): {
  plain: string[];
  hashed: string[];
} {
  const plain: string[] = [];
  for (let i = 0; i < count; i++) {
    // 10 hex chars grouped as XXXXX-XXXXX
    const raw = randomBytes(5).toString("hex"); // 10 chars
    plain.push(`${raw.slice(0, 5)}-${raw.slice(5)}`);
  }
  // Hashing handled by caller (bcrypt) to keep this module crypto-only and
  // synchronous; see lib/auth/two-factor.ts.
  return { plain, hashed: [] };
}
