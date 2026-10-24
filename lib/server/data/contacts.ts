import { and, desc, sql } from "drizzle-orm";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { contact } from "@/lib/db/schema";
import { notDeleted } from "@/lib/db/soft-delete";

/**
 * Server-side first page of contacts, mirroring GET /api/v1/contacts with the
 * default filters (no search, all types, newest first).
 */
export async function listContacts(organizationId: string, limit = 50) {
  const conditions = [
    eq(contact.organizationId, organizationId),
    notDeleted(contact.deletedAt),
  ];

  const rows = await db.query.contact.findMany({
    where: and(...conditions),
    orderBy: desc(contact.createdAt),
    limit,
  });

  const [count] = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(contact)
    .where(and(...conditions));

  return { contacts: rows, total: Number(count?.count ?? 0) };
}
