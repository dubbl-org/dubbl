import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fixedAsset, depreciationEntry } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { logAudit, diffChanges } from "@/lib/api/audit";
import { notDeleted, softDelete } from "@/lib/db/soft-delete";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  assetNumber: z.string().min(1).optional(),
  residualValue: z.number().int().min(0).optional(),
  usefulLifeMonths: z.number().int().min(1).optional(),
  depreciationMethod: z
    .enum(["straight_line", "declining_balance"])
    .optional(),
  assetAccountId: z.string().nullable().optional(),
  depreciationAccountId: z.string().nullable().optional(),
  accumulatedDepAccountId: z.string().nullable().optional(),
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
        assetAccount: true,
        depreciationAccount: true,
        accumulatedDepAccount: true,
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
