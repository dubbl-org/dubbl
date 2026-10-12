/**
 * Fields that must never leave the server, whatever relation they were loaded
 * through. Drizzle `with: { user: true }` pulls the whole users row, including
 * the password hash, so responses are scrubbed as they're serialised.
 */
const SECRET_KEYS = new Set(["passwordHash", "smtpPassword"]);

export function redactSecrets(_key: string, value: unknown) {
  return SECRET_KEYS.has(_key) ? undefined : value;
}

/** JSON.stringify with secret fields removed. */
export function safeStringify(data: unknown) {
  return JSON.stringify(data, redactSecrets);
}
