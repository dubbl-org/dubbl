import { db } from "@/lib/db";
import { contractor } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, ok, notFound } from "@/lib/api/response";
import { notDeleted, softDelete } from "@/lib/db/soft-delete";
import { logAudit } from "@/lib/api/audit";
import { z } from "zod";
import { currencyCodeSchema } from "@/lib/currency/zod";

// Blank optional text fields arrive as "" from forms; store them as null
const blankToNull = (v: unknown) =>
  typeof v === "string" && v.trim() === "" ? null : v;

const updateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  email: z.preprocess(blankToNull, z.string().trim().email().nullable().optional()),
  company: z.preprocess(blankToNull, z.string().trim().nullable().optional()),
  taxId: z.preprocess(blankToNull, z.string().trim().nullable().optional()),
  hourlyRate: z.number().int().min(0).nullable().optional(), // cents
  currency: currencyCodeSchema.optional(),
  bankAccountNumber: z.preprocess(blankToNull, z.string().trim().nullable().optional()),
  isActive: z.boolean().optional(),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:contractors");

    const c = await db.query.contractor.findFirst({
      where: and(
        eq(contractor.id, id),
        eq(contractor.organizationId, ctx.organizationId),
        notDeleted(contractor.deletedAt)
      ),
      with: { payments: true },
    });

    if (!c) return notFound("Contractor");
    return ok({ contractor: c });
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
    requireRole(ctx, "manage:contractors");

    const body = await request.json();
    const parsed = updateSchema.parse(body);

    const [updated] = await db
      .update(contractor)
      .set({ ...parsed, updatedAt: new Date() })
      .where(and(
        eq(contractor.id, id),
        eq(contractor.organizationId, ctx.organizationId),
        notDeleted(contractor.deletedAt)
      ))
      .returning();

    if (!updated) return notFound("Contractor");

    logAudit({ ctx, action: "update", entityType: "contractor", entityId: id, changes: parsed, request });

    return ok({ contractor: updated });
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
    requireRole(ctx, "manage:contractors");

    const [deleted] = await db
      .update(contractor)
      .set(softDelete())
      .where(and(
        eq(contractor.id, id),
        eq(contractor.organizationId, ctx.organizationId)
      ))
      .returning();

    if (!deleted) return notFound("Contractor");

    logAudit({ ctx, action: "delete", entityType: "contractor", entityId: id, request });

    return ok({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
