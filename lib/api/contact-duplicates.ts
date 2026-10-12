import { db } from "@/lib/db";
import { contact, invoice, bill, payment, quote } from "@/lib/db/schema";
import { and, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";

export type DuplicateReason = "name" | "email" | "taxNumber";

export interface DuplicateMember {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  type: "customer" | "supplier" | "both";
  currencyCode: string | null;
  createdAt: Date;
  /** Last 4 characters of the tax number only, never the full value. */
  taxNumberHint: string | null;
  invoiceCount: number;
  billCount: number;
  quoteCount: number;
  paymentCount: number;
  /** Unpaid invoices (cents). */
  owesYou: number;
  /** Unpaid bills (cents). */
  youOwe: number;
}

export interface DuplicateGroup {
  /** Stable key: the member ids sorted and joined. */
  key: string;
  reasons: DuplicateReason[];
  /** What the members share, e.g. the normalised name or the email. Tax numbers are masked. */
  matched: { reason: DuplicateReason; value: string }[];
  /** The member that should survive a merge: most records, then oldest. */
  suggestedKeepId: string;
  members: DuplicateMember[];
}

// Legal-form words that don't make two companies different.
const LEGAL_SUFFIXES = new Set([
  "inc", "incorporated", "llc", "llp", "lp", "ltd", "limited", "corp", "corporation", "co", "company",
  "plc", "gmbh", "ag", "kg", "sa", "sas", "sarl", "srl", "spa", "bv", "nv", "pty", "pte", "oy", "ab",
  "as", "aps", "kft", "zrt", "nyrt", "bt", "sro", "doo", "kk", "group", "holdings",
]);

/** "The Acme Corp., Inc." and "acme corp" both become "acme". */
export function normaliseName(name: string) {
  const words = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words[0] === "the" && words.length > 1) words.shift();
  while (words.length > 1 && LEGAL_SUFFIXES.has(words[words.length - 1])) words.pop();
  return words.join(" ");
}

export function normaliseEmail(email: string | null) {
  const e = email?.trim().toLowerCase();
  return e && e.includes("@") ? e : null;
}

export function normaliseTaxNumber(tax: string | null) {
  const t = tax?.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return t && t.length >= 5 ? t : null;
}

function maskTax(tax: string) {
  return `ending ${tax.slice(-4)}`;
}

/**
 * Find likely duplicate contacts: the same normalised name, the same email or
 * the same tax number. Contacts linked through any of these end up in one group
 * (so A~B by email and B~C by name gives the group A, B, C).
 */
export async function findDuplicateContacts(organizationId: string): Promise<DuplicateGroup[]> {
  const all = await db
    .select({
      id: contact.id,
      name: contact.name,
      email: contact.email,
      phone: contact.phone,
      type: contact.type,
      currencyCode: contact.currencyCode,
      taxNumber: contact.taxNumber,
      createdAt: contact.createdAt,
    })
    .from(contact)
    .where(and(eq(contact.organizationId, organizationId), isNull(contact.deletedAt)));

  // Union-find over contact indexes.
  const parent = all.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };

  const keyed: Record<DuplicateReason, Map<string, number[]>> = { name: new Map(), email: new Map(), taxNumber: new Map() };
  all.forEach((c, i) => {
    const keys: [DuplicateReason, string | null][] = [
      ["name", normaliseName(c.name) || null],
      ["email", normaliseEmail(c.email)],
      ["taxNumber", normaliseTaxNumber(c.taxNumber)],
    ];
    for (const [reason, key] of keys) {
      if (!key || (reason === "name" && key.length < 2)) continue;
      const list = keyed[reason].get(key) ?? [];
      list.push(i);
      keyed[reason].set(key, list);
    }
  });
  for (const map of Object.values(keyed)) {
    for (const list of map.values()) for (let k = 1; k < list.length; k++) union(list[0], list[k]);
  }

  const groups = new Map<number, number[]>();
  all.forEach((_, i) => {
    const r = find(i);
    groups.set(r, [...(groups.get(r) ?? []), i]);
  });
  const multi = [...groups.values()].filter((g) => g.length > 1);
  if (multi.length === 0) return [];

  const ids = multi.flat().map((i) => all[i].id);
  // invoice, bill, quote and payment all carry organizationId, contactId and
  // deletedAt, so one query shape counts each of them.
  const countBy = async (table: typeof invoice, due: SQL = sql`0`) => {
    const rows = await db
      .select({
        contactId: table.contactId,
        n: sql<number>`count(*)`.mapWith(Number),
        due: sql<number>`${due}`.mapWith(Number),
      })
      .from(table)
      .where(and(eq(table.organizationId, organizationId), isNull(table.deletedAt), inArray(table.contactId, ids)))
      .groupBy(table.contactId);
    return new Map(rows.map((r) => [r.contactId, r]));
  };
  const asTable = (t: unknown) => t as typeof invoice;
  const [invoices, bills, quotes, payments] = await Promise.all([
    countBy(invoice, sql`coalesce(sum(greatest(${invoice.amountDue}, 0)) filter (where ${invoice.status} in ('sent', 'partial', 'overdue')), 0)::bigint`),
    countBy(asTable(bill), sql`coalesce(sum(greatest(${bill.amountDue}, 0)) filter (where ${bill.status} in ('received', 'partial', 'overdue')), 0)::bigint`),
    countBy(asTable(quote)),
    countBy(asTable(payment)),
  ]);

  const result: DuplicateGroup[] = multi.map((indexes) => {
    const members: DuplicateMember[] = indexes.map((i) => {
      const c = all[i];
      const tax = normaliseTaxNumber(c.taxNumber);
      return {
        id: c.id,
        name: c.name,
        email: c.email,
        phone: c.phone,
        type: c.type,
        currencyCode: c.currencyCode,
        createdAt: c.createdAt,
        taxNumberHint: tax ? tax.slice(-4) : null,
        invoiceCount: invoices.get(c.id)?.n ?? 0,
        billCount: bills.get(c.id)?.n ?? 0,
        quoteCount: quotes.get(c.id)?.n ?? 0,
        paymentCount: payments.get(c.id)?.n ?? 0,
        owesYou: invoices.get(c.id)?.due ?? 0,
        youOwe: bills.get(c.id)?.due ?? 0,
      };
    });

    const matched: DuplicateGroup["matched"] = [];
    for (const reason of ["name", "email", "taxNumber"] as DuplicateReason[]) {
      for (const [key, list] of keyed[reason]) {
        if (list.length > 1 && list.every((i) => indexes.includes(i))) {
          matched.push({ reason, value: reason === "taxNumber" ? maskTax(key) : reason === "name" ? all[list[0]].name : key });
        }
      }
    }

    const weight = (m: DuplicateMember) => m.invoiceCount + m.billCount + m.quoteCount + m.paymentCount;
    const keep = [...members].sort((a, b) => weight(b) - weight(a) || a.createdAt.getTime() - b.createdAt.getTime())[0];
    members.sort((a, b) => (a.id === keep.id ? -1 : b.id === keep.id ? 1 : a.createdAt.getTime() - b.createdAt.getTime()));

    return {
      key: members.map((m) => m.id).sort().join(":"),
      reasons: [...new Set(matched.map((m) => m.reason))],
      matched,
      suggestedKeepId: keep.id,
      members,
    };
  });

  // Strongest evidence first (tax number, then email, then name), then bigger groups.
  const rank = (g: DuplicateGroup) => (g.reasons.includes("taxNumber") ? 4 : 0) + (g.reasons.includes("email") ? 2 : 0) + (g.reasons.includes("name") ? 1 : 0);
  return result.sort((a, b) => rank(b) - rank(a) || b.members.length - a.members.length);
}
