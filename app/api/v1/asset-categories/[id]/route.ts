import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { assetCategory } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
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
  defaultDepreciationMethod: depreciationMethodEnum.optional(),
  defaultConvention: conventionEnum.optional(),
  defaultUsefulLifeMonths: z.number().int().min(1).nullable().optional(),
  defaultResidualValue: z.number().int().min(0).optional(),
  defaultDepreciationRateBp: z.number().int().min(0).max(100000).nullable().optional(),
  assetAccountId: z.string().uuid().nullable().optional(),
  depreciationAccountId: z.string().uuid().nullable().optional(),
  accumulatedDepAccountId: z.string().uuid().nullable().optional(),
  cwipAccountId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().optional(),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);

    const category = await db.query.assetCategory.findFirst({
      where: and(
        eq(assetCategory.id, id),
        eq(assetCategory.organizationId, ctx.organizationId),
        notDeleted(assetCategory.deletedAt)
      ),
      with: {
        assetAccount: true,
        depreciationAccount: true,
        accumulatedDepAccount: true,
        cwipAccount: true,
      },
    });

    if (!category) return notFound("Asset category");
    return NextResponse.json({ category });
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

    const existing = await db.query.assetCategory.findFirst({
      where: and(
        eq(assetCategory.id, id),
        eq(assetCategory.organizationId, ctx.organizationId),
        notDeleted(assetCategory.deletedAt)
      ),
    });

    if (!existing) return notFound("Asset category");

    const body = await request.json();
    const parsed = updateSchema.parse(body);

    const [updated] = await db
      .update(assetCategory)
      .set({ ...parsed, updatedAt: new Date() })
      .where(
        and(
          eq(assetCategory.id, id),
          eq(assetCategory.organizationId, ctx.organizationId)
        )
      )
      .returning();

    logAudit({
      ctx,
      action: "update",
      entityType: "asset_category",
      entityId: id,
      changes: diffChanges(
        existing as Record<string, unknown>,
        updated as Record<string, unknown>
      ),
      request,
    });

    return NextResponse.json({ category: updated });
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

    const existing = await db.query.assetCategory.findFirst({
      where: and(
        eq(assetCategory.id, id),
        eq(assetCategory.organizationId, ctx.organizationId),
        notDeleted(assetCategory.deletedAt)
      ),
    });

    if (!existing) return notFound("Asset category");

    await db
      .update(assetCategory)
      .set(softDelete())
      .where(
        and(
          eq(assetCategory.id, id),
          eq(assetCategory.organizationId, ctx.organizationId)
        )
      );

    logAudit({
      ctx,
      action: "delete",
      entityType: "asset_category",
      entityId: id,
      changes: existing as Record<string, unknown>,
      request,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
