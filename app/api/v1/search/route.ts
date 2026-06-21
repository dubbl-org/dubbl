import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { invoice, bill, contact, document } from "@/lib/db/schema";
import { and, eq, or, ilike, desc } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";

// Max results returned per entity type.
const PER_TYPE = 5;

export type SearchResult = {
  type: "invoice" | "bill" | "contact" | "document";
  id: string;
  title: string;
  subtitle: string | null;
  href: string;
};

/**
 * Global search across invoices, bills, contacts, and documents (org-scoped).
 *
 * GET /api/v1/search?q=<term>
 * Returns: { results: SearchResult[] } — a small unified, capped-per-type list.
 * Each result carries a navigable `href` into the dashboard.
 */
export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const url = new URL(request.url);
    const q = (url.searchParams.get("q") || "").trim();

    // Require a minimum query length to avoid scanning everything.
    if (q.length < 2) {
      return NextResponse.json({ results: [] });
    }

    const term = `%${q}%`;

    const [invoices, bills, contacts, documents] = await Promise.all([
      // Invoices: match by number or reference. Linked to a contact for subtitle.
      db.query.invoice.findMany({
        where: and(
          eq(invoice.organizationId, ctx.organizationId),
          notDeleted(invoice.deletedAt),
          or(ilike(invoice.invoiceNumber, term), ilike(invoice.reference, term))
        ),
        orderBy: desc(invoice.createdAt),
        limit: PER_TYPE,
        columns: { id: true, invoiceNumber: true },
        with: { contact: { columns: { name: true } } },
      }),
      // Bills: match by number or reference.
      db.query.bill.findMany({
        where: and(
          eq(bill.organizationId, ctx.organizationId),
          notDeleted(bill.deletedAt),
          or(ilike(bill.billNumber, term), ilike(bill.reference, term))
        ),
        orderBy: desc(bill.createdAt),
        limit: PER_TYPE,
        columns: { id: true, billNumber: true },
        with: { contact: { columns: { name: true } } },
      }),
      // Contacts: match by name, email, or tax number.
      db.query.contact.findMany({
        where: and(
          eq(contact.organizationId, ctx.organizationId),
          notDeleted(contact.deletedAt),
          or(
            ilike(contact.name, term),
            ilike(contact.email, term),
            ilike(contact.taxNumber, term)
          )
        ),
        orderBy: desc(contact.createdAt),
        limit: PER_TYPE,
        columns: { id: true, name: true, email: true },
      }),
      // Documents: match by file name.
      db.query.document.findMany({
        where: and(
          eq(document.organizationId, ctx.organizationId),
          notDeleted(document.deletedAt),
          ilike(document.fileName, term)
        ),
        orderBy: desc(document.createdAt),
        limit: PER_TYPE,
        columns: { id: true, fileName: true },
      }),
    ]);

    const results: SearchResult[] = [
      ...invoices.map((r) => ({
        type: "invoice" as const,
        id: r.id,
        title: r.invoiceNumber,
        subtitle: r.contact?.name ?? null,
        href: `/sales/${r.id}`,
      })),
      ...bills.map((r) => ({
        type: "bill" as const,
        id: r.id,
        title: r.billNumber,
        subtitle: r.contact?.name ?? null,
        href: `/purchases/${r.id}`,
      })),
      ...contacts.map((r) => ({
        type: "contact" as const,
        id: r.id,
        title: r.name,
        subtitle: r.email ?? null,
        href: `/contacts/${r.id}`,
      })),
      ...documents.map((r) => ({
        type: "document" as const,
        id: r.id,
        title: r.fileName,
        subtitle: null,
        href: `/documents`,
      })),
    ];

    return NextResponse.json({ results });
  } catch (err) {
    return handleError(err);
  }
}
