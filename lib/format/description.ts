/**
 * Imported bank descriptions carry identifiers that mean nothing to a reader.
 * A statement line and a matched claim should look alike at a glance, not differ
 * by a uuid or a claim reference.
 */
export function cleanDescription(text: string): string {
  return text
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "")
    .replace(/\bET-[0-9a-f]{16,}\b/gi, "")
    .replace(/\s*\|\s*(\|\s*)*/g, " · ")
    .replace(/^[\s·]+|[\s·]+$/g, "")
    .replace(/\s{2,}/g, " ");
}

/** "Hetzner · Expense · Genba portion…" reads as a payee and what it was for. */
export function splitDescription(text: string): { payee: string; detail: string } {
  const parts = cleanDescription(text).split(" · ").filter(Boolean);
  if (parts.length <= 1) return { payee: parts[0] || text, detail: "" };
  return { payee: parts[0], detail: parts.slice(1).join(" · ") };
}
