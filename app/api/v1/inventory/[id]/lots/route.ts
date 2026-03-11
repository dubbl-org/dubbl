import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { lotBatch, inventoryItem } from "@/lib/db/schema";
import { eq, and, isNull, sql, desc } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { parsePagination, paginatedResponse } from "@/lib/api/pagination";
import { z } from "zod";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getAuthContext(request);
    const { id } = await params;
    const url = new URL(request.url);
    const { page, limit, offset } = parsePagination(url);

    const conditions = [
      eq(lotBatch.organizationId, ctx.organizationId),
      eq(lotBatch.inventoryItemId, id),
      isNull(lotBatch.deletedAt),
    ];

    const lots = await db.query.lotBatch.findMany({
      where: and(...conditions),
      orderBy: desc(lotBatch.createdAt),
      limit,
      offset,
      with: { warehouse: true },
    });

    const [countResult] = await db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(lotBatch)
      .where(and(...conditions));

    return NextResponse.json(
      paginatedResponse(lots, Number(countResult?.count || 0), page, limit)
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
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:inventory");
    const { id } = await params;

    const item = await db.query.inventoryItem.findFirst({
      where: and(
        eq(inventoryItem.id, id),
        eq(inventoryItem.organizationId, ctx.organizationId),
      ),
    });
    if (!item) return notFound("Inventory item");

    const body = await request.json();
    const parsed = z.object({
      lotNumber: z.string().nullable().optional(),
      batchNumber: z.string().nullable().optional(),
      quantity: z.number().int().min(1),
      warehouseId: z.string().nullable().optional(),
      manufacturingDate: z.string().nullable().optional(),
      expiryDate: z.string().nullable().optional(),
    }).parse(body);

    const [created] = await db
      .insert(lotBatch)
      .values({
        organizationId: ctx.organizationId,
        inventoryItemId: id,
        lotNumber: parsed.lotNumber || null,
        batchNumber: parsed.batchNumber || null,
        quantity: parsed.quantity,
        availableQuantity: parsed.quantity,
        warehouseId: parsed.warehouseId || null,
        manufacturingDate: parsed.manufacturingDate || null,
        expiryDate: parsed.expiryDate || null,
      })
      .returning();

    return NextResponse.json({ lot: created }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
