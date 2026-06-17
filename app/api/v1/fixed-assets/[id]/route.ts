import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fixedAsset, depreciationEntry, assetCategory } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound, validationError } from "@/lib/api/response";
import { logAudit, diffChanges } from "@/lib/api/audit";
import { notDeleted, softDelete } from "@/lib/db/soft-delete";
import { z } from "zod";

const depreciationMethodEnum = z.enum([
  "straight_line",
  "declining_balance",
  "units_of_production",
  "sum_of_years_digits",
]);

const conventionEnum = z.enum([
  "full_month",
  "mid_month",
  "half_year",
  "mid_quarter",
  "pro_rata_days",
  "full_at_purchase",
]);

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  assetNumber: z.string().min(1).optional(),
  categoryId: z.string().uuid().nullable().optional(),
  inServiceDate: z.string().nullable().optional(),
  residualValue: z.number().int().min(0).optional(),
  usefulLifeMonths: z.number().int().min(1).optional(),
  depreciationMethod: depreciationMethodEnum.optional(),
  convention: conventionEnum.optional(),
  totalExpectedUnits: z.number().int().min(0).nullable().optional(),
  unitOfMeasure: z.string().nullable().optional(),
  isCwip: z.boolean().optional(),
  cwipAccountId: z.string().uuid().nullable().optional(),
  assetAccountId: z.string().uuid().nullable().optional(),
  depreciationAccountId: z.string().uuid().nullable().optional(),
  accumulatedDepAccountId: z.string().uuid().nullable().optional(),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);

    const asset = await db.query.fixedAsset.findFirst({
      where: and(
        eq(fixedAsset.id, id),
        eq(fixedAsset.organizationId, ctx.organizationId),
        notDeleted(fixedAsset.deletedAt)
      ),
      with: {
        category: true,
        assetAccount: true,
        depreciationAccount: true,
        accumulatedDepAccount: true,
        cwipAccount: true,
        depreciationEntries: {
          with: { journalEntry: true },
          orderBy: depreciationEntry.date,
        },
      },
    });

    if (!asset) return notFound("Fixed asset");
    return NextResponse.json({ asset });
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
    requireRole(ctx, "manage:assets");

    const existing = await db.query.fixedAsset.findFirst({
      where: and(
        eq(fixedAsset.id, id),
        eq(fixedAsset.organizationId, ctx.organizationId),
        notDeleted(fixedAsset.deletedAt)
      ),
    });

    if (!existing) return notFound("Fixed asset");

    const body = await request.json();
    const parsed = updateSchema.parse(body);

    // Validate the category belongs to this org when reassigning.
    if (parsed.categoryId) {
      const category = await db.query.assetCategory.findFirst({
        where: and(
          eq(assetCategory.id, parsed.categoryId),
          eq(assetCategory.organizationId, ctx.organizationId),
          notDeleted(assetCategory.deletedAt)
        ),
      });
      if (!category) return validationError("Asset category not found");
    }

    const [updated] = await db
      .update(fixedAsset)
      .set({ ...parsed, updatedAt: new Date() })
      .where(eq(fixedAsset.id, id))
      .returning();

    logAudit({ ctx, action: "update", entityType: "fixed_asset", entityId: id, changes: diffChanges(existing as Record<string, unknown>, updated as Record<string, unknown>), request });

    return NextResponse.json({ asset: updated });
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
    requireRole(ctx, "manage:assets");

    const existing = await db.query.fixedAsset.findFirst({
      where: and(
        eq(fixedAsset.id, id),
        eq(fixedAsset.organizationId, ctx.organizationId),
        notDeleted(fixedAsset.deletedAt)
      ),
    });

    if (!existing) return notFound("Fixed asset");

    await db
      .update(fixedAsset)
      .set(softDelete())
      .where(eq(fixedAsset.id, id));

    logAudit({
      ctx,
      action: "delete",
      entityType: "fixed_asset",
      entityId: id,
      changes: existing as Record<string, unknown>,
      request,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
