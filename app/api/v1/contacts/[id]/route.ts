import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { contact, contactPerson } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { notDeleted, softDelete } from "@/lib/db/soft-delete";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().nullable().optional(),
  taxNumber: z.string().nullable().optional(),
  type: z.enum(["customer", "supplier", "both"]).optional(),
  paymentTermsDays: z.number().int().min(0).optional(),
  addresses: z.any().optional(),
  notes: z.string().nullable().optional(),
  currencyCode: z.string().optional(),
  creditLimit: z.number().int().min(0).nullable().optional(),
  isTaxExempt: z.boolean().optional(),
  defaultRevenueAccountId: z.string().uuid().nullable().optional(),
  defaultExpenseAccountId: z.string().uuid().nullable().optional(),
  defaultTaxRateId: z.string().uuid().nullable().optional(),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);

    const found = await db.query.contact.findFirst({
      where: and(
        eq(contact.id, id),
        eq(contact.organizationId, ctx.organizationId),
        notDeleted(contact.deletedAt)
      ),
      with: {
        defaultRevenueAccount: true,
        defaultExpenseAccount: true,
        defaultTaxRate: true,
        people: {
          where: notDeleted(contactPerson.deletedAt),
          orderBy: desc(contactPerson.createdAt),
        },
      },
    });

    if (!found) return notFound("Contact");
    return NextResponse.json({ contact: found });
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:contacts");

    const body = await request.json();
    const parsed = updateSchema.parse(body);

    const existing = await db.query.contact.findFirst({
      where: and(
        eq(contact.id, id),
        eq(contact.organizationId, ctx.organizationId),
        notDeleted(contact.deletedAt)
      ),
    });

    if (!existing) return notFound("Contact");

    const [updated] = await db
      .update(contact)
      .set({ ...parsed, updatedAt: new Date() })
      .where(eq(contact.id, id))
      .returning();

    return NextResponse.json({ contact: updated });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:contacts");

    const existing = await db.query.contact.findFirst({
      where: and(
        eq(contact.id, id),
        eq(contact.organizationId, ctx.organizationId),
        notDeleted(contact.deletedAt)
      ),
    });

    if (!existing) return notFound("Contact");

    await db
      .update(contact)
      .set(softDelete())
      .where(eq(contact.id, id));

    logAudit({
      ctx,
      action: "delete",
      entityType: "contact",
      entityId: id,
      changes: existing as Record<string, unknown>,
      request,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
