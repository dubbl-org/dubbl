import { db } from "@/lib/db";
import { contact, contactPerson } from "@/lib/db/schema";
import { and, asc, desc, eq, ilike, isNull, or, sql, type SQL } from "drizzle-orm";

/** A contact person together with the company (contact) they belong to. */
export interface ContactPersonRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  jobTitle: string | null;
  isPrimary: boolean;
  notes: string | null;
  createdAt: Date;
  contactId: string;
  contactName: string;
  contactType: "customer" | "supplier" | "both";
  contactEmail: string | null;
}

/**
 * Every person across the organization's contacts. Org-scoped through the
 * parent contact (contact_person has no organization_id of its own).
 */
export async function listContactPeople(
  organizationId: string,
  opts: {
    search?: string | null;
    contactId?: string | null;
    contactType?: "customer" | "supplier" | null;
    primaryOnly?: boolean;
    limit: number;
    offset: number;
  }
): Promise<{ rows: ContactPersonRow[]; total: number }> {
  const conditions: SQL[] = [
    eq(contact.organizationId, organizationId),
    isNull(contact.deletedAt),
    isNull(contactPerson.deletedAt),
  ];
  if (opts.search) {
    const q = `%${opts.search}%`;
    conditions.push(
      or(
        ilike(contactPerson.name, q),
        ilike(contactPerson.email, q),
        ilike(contactPerson.phone, q),
        ilike(contactPerson.jobTitle, q),
        ilike(contact.name, q)
      )!
    );
  }
  if (opts.contactId) conditions.push(eq(contactPerson.contactId, opts.contactId));
  if (opts.contactType) {
    conditions.push(or(eq(contact.type, opts.contactType), eq(contact.type, "both"))!);
  }
  if (opts.primaryOnly) conditions.push(eq(contactPerson.isPrimary, true));

  const where = and(...conditions);
  const [rows, [countRow]] = await Promise.all([
    db
      .select({
        id: contactPerson.id,
        name: contactPerson.name,
        email: contactPerson.email,
        phone: contactPerson.phone,
        jobTitle: contactPerson.jobTitle,
        isPrimary: contactPerson.isPrimary,
        notes: contactPerson.notes,
        createdAt: contactPerson.createdAt,
        contactId: contact.id,
        contactName: contact.name,
        contactType: contact.type,
        contactEmail: contact.email,
      })
      .from(contactPerson)
      .innerJoin(contact, eq(contactPerson.contactId, contact.id))
      .where(where)
      .orderBy(asc(contact.name), desc(contactPerson.isPrimary), asc(contactPerson.name))
      .limit(opts.limit)
      .offset(opts.offset),
    db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(contactPerson)
      .innerJoin(contact, eq(contactPerson.contactId, contact.id))
      .where(where),
  ]);

  return { rows, total: Number(countRow?.count ?? 0) };
}
