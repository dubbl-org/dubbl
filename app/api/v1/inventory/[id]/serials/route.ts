import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { serialNumber, inventoryItem } from "@/lib/db/schema";
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
    const status = url.searchParams.get("status");

    const conditions = [
      eq(serialNumber.organizationId, ctx.organizationId),
      eq(serialNumber.inventoryItemId, id),
      isNull(serialNumber.deletedAt),
    ];

    if (status && ["available", "sold", "reserved", "damaged"].includes(status)) {
      conditions.push(eq(serialNumber.status, status as "available"));
    }

    const serials = await db.query.serialNumber.findMany({
      where: and(...conditions),
      orderBy: desc(serialNumber.createdAt),
      limit,
      offset,
      with: { warehouse: true },
    });

    const [countResult] = await db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(serialNumber)
      .where(and(...conditions));

    return NextResponse.json(
      paginatedResponse(serials, Number(countResult?.count || 0), page, limit)
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
      serialNumbers: z.array(z.string().min(1)).min(1),
      warehouseId: z.string().nullable().optional(),
    }).parse(body);

    const created = [];
    for (const sn of parsed.serialNumbers) {
      const [record] = await db
        .insert(serialNumber)
        .values({
          organizationId: ctx.organizationId,
          inventoryItemId: id,
          serialNumber: sn,
          warehouseId: parsed.warehouseId || null,
          status: "available",
        })
        .returning();
      created.push(record);
    }

    return NextResponse.json({ data: created }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
