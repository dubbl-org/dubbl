/**
 * Pure helpers shared by the PDF renderer, the HTML preview generator and the
 * document-template API/MCP tools. No DB or React imports so they can be unit
 * tested directly.
 */

export type DocumentTemplateType = "invoice" | "quote" | "receipt" | "payslip" | "purchase_order";

export const DEFAULT_ACCENT_COLOR = "#10b981";

/** Hex colours only (#rgb or #rrggbb); used to validate the Accent Color field. */
export const HEX_COLOR_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/** The template's accent colour if it's a valid hex colour, otherwise the default. */
export function safeAccentColor(color: string | null | undefined): string {
  return color && HEX_COLOR_RE.test(color.trim()) ? color.trim() : DEFAULT_ACCENT_COLOR;
}

/** Swap {{variable}} placeholders for their values; unknown ones are left as typed. */
export function replacePlaceholders(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (match, key) => vars[key] ?? match);
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  copy: "©",
  reg: "®",
  trade: "™",
  middot: "·",
  bull: "•",
  euro: "€",
  pound: "£",
  yen: "¥",
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === "#") {
      const n = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : match;
    }
    return NAMED_ENTITIES[code.toLowerCase()] ?? match;
  });
}

/**
 * Turn the simple HTML people paste into a template's header/footer into plain
 * text. Line breaks, paragraphs, headings and list items become new lines,
 * <li> gets a bullet, scripts/styles are dropped with their content and every
 * other tag is removed. The result is safe to print in a PDF or to escape into
 * HTML; nothing from the original markup is ever injected.
 */
export function htmlToPlainText(html: string): string {
  const text = html
    .replace(/\r\n?/g, "\n")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|head|title|iframe|object|svg)\b[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "\n• ")
    .replace(/<\/li\s*>/gi, "")
    .replace(/<\/?(p|div|h[1-6]|ul|ol|tr|table|section|header|footer|blockquote|address|hr)\b[^>]*>/gi, "\n")
    .replace(/<\/?(td|th)\b[^>]*>/gi, " ")
    .replace(/<[^>]*>/g, "")
    // A stray "<" left by an unclosed tag would otherwise survive.
    .replace(/</g, "");

  return decodeEntities(text)
    .split("\n")
    .map((line) => line.replace(/[ \t\f\v ]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Template header/footer text with placeholders filled, ready to print. */
export function templateBlockText(
  source: string | null | undefined,
  vars: Record<string, string>
): string | null {
  if (!source) return null;
  const text = htmlToPlainText(replacePlaceholders(source, vars));
  return text || null;
}

function daysBetween(from: string, to: string): number | null {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86_400_000);
}

/**
 * The "Payment terms" line printed under an invoice's totals when the
 * template's Show Payment Terms is on, e.g. "Net 30. Please pay by 2026-04-09."
 */
export function paymentTermsText(issueDate: string, dueDate: string | null | undefined): string | null {
  if (!dueDate) return null;
  const days = daysBetween(issueDate, dueDate);
  if (days === null) return `Please pay by ${dueDate}.`;
  if (days <= 0) return "Due on receipt.";
  return `Net ${days}. Please pay by ${dueDate}.`;
}

interface DefaultCandidate {
  id: string;
  type: string;
  isDefault: boolean;
}

/**
 * Which templates must lose their default flag when `target` is saved, so an
 * organization keeps exactly one default per document type. Returns the IDs to
 * switch off (never the target itself). Saving with isDefault false or unset
 * changes nothing.
 */
export function defaultsToUnset(
  templates: DefaultCandidate[],
  target: { id?: string | null; type: string; isDefault?: boolean | null }
): string[] {
  if (!target.isDefault) return [];
  return templates
    .filter((t) => t.type === target.type && t.isDefault && t.id !== target.id)
    .map((t) => t.id);
}

/** Which documents print with each template type's default template. */
export const TEMPLATE_TYPE_DOCUMENTS: Record<DocumentTemplateType, string[]> = {
  invoice: ["Invoices", "Credit notes", "Customer portal and pay link invoices"],
  quote: ["Quotes"],
  receipt: ["Cash sales (sales receipts)"],
  payslip: ["Payslips"],
  purchase_order: ["Purchase orders", "Debit notes"],
};
