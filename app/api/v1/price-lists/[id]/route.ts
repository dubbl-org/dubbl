import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { priceList } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { notDeleted, softDelete } from "@/lib/db/soft-delete";
import { logAudit } from "@/lib/api/audit";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  currencyCode: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
  effectiveFrom: z.string().nullable().optional(),
  effectiveTo: z.string().nullable().optional(),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);

    const list = await db.query.priceList.findFirst({
      where: and(
        eq(priceList.id, id),
        eq(priceList.organizationId, ctx.organizationId),
        notDeleted(priceList.deletedAt)
      ),
      with: {
        items: {
          with: { inventoryItem: true },
          orderBy: (i, { asc: a }) => [a(i.minQuantity)],
        },
      },
    });

    if (!list) return notFound("Price list");

    return NextResponse.json({ priceList: list });
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
    requireRole(ctx, "manage:inventory");

    const body = await request.json();
    const parsed = updateSchema.parse(body);

    const [updated] = await db
      .update(priceList)
      .set({ ...parsed, updatedAt: new Date() })
      .where(
        and(
          eq(priceList.id, id),
          eq(priceList.organizationId, ctx.organizationId),
          notDeleted(priceList.deletedAt)
        )
      )
      .returning();

    if (!updated) return notFound("Price list");

    logAudit({
      ctx,
      action: "update",
      entityType: "price_list",
      entityId: id,
      changes: parsed as Record<string, unknown>,
      request,
    });

    return NextResponse.json({ priceList: updated });
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
    requireRole(ctx, "manage:inventory");

    const [deleted] = await db
      .update(priceList)
      .set(softDelete())
      .where(
        and(
          eq(priceList.id, id),
          eq(priceList.organizationId, ctx.organizationId),
          notDeleted(priceList.deletedAt)
        )
      )
      .returning();

    if (!deleted) return notFound("Price list");

    logAudit({
      ctx,
      action: "delete",
      entityType: "price_list",
      entityId: id,
      changes: deleted as Record<string, unknown>,
      request,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
