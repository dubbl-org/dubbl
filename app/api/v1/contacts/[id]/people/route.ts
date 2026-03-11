import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { contactPerson, contact } from "@/lib/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { parsePagination, paginatedResponse } from "@/lib/api/pagination";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().nullable().optional(),
  phone: z.string().nullable().optional(),
  jobTitle: z.string().nullable().optional(),
  isPrimary: z.boolean().default(false),
  notes: z.string().nullable().optional(),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);

    // Verify contact belongs to org
    const parentContact = await db.query.contact.findFirst({
      where: and(
        eq(contact.id, id),
        eq(contact.organizationId, ctx.organizationId),
        notDeleted(contact.deletedAt)
      ),
    });

    if (!parentContact) return notFound("Contact");

    const url = new URL(request.url);
    const { page, limit, offset } = parsePagination(url);

    const conditions = [
      eq(contactPerson.contactId, id),
      notDeleted(contactPerson.deletedAt),
    ];

    const people = await db.query.contactPerson.findMany({
      where: and(...conditions),
      orderBy: desc(contactPerson.createdAt),
      limit,
      offset,
    });

    const [countResult] = await db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(contactPerson)
      .where(and(...conditions));

    return NextResponse.json(
      paginatedResponse(people, Number(countResult?.count || 0), page, limit)
    );
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:contacts");

    // Verify contact belongs to org
    const parentContact = await db.query.contact.findFirst({
      where: and(
        eq(contact.id, id),
        eq(contact.organizationId, ctx.organizationId),
        notDeleted(contact.deletedAt)
      ),
    });

    if (!parentContact) return notFound("Contact");

    const body = await request.json();
    const parsed = createSchema.parse(body);

    const [created] = await db
      .insert(contactPerson)
      .values({
        contactId: id,
        name: parsed.name,
        email: parsed.email || null,
        phone: parsed.phone || null,
        jobTitle: parsed.jobTitle || null,
        isPrimary: parsed.isPrimary,
        notes: parsed.notes || null,
      })
      .returning();

    return NextResponse.json({ person: created }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
