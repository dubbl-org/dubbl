import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { inventoryTransfer, inventoryTransferLine } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { z } from "zod";

const createSchema = z.object({
  fromWarehouseId: z.string().uuid(),
  toWarehouseId: z.string().uuid(),
  notes: z.string().nullable().optional(),
  lines: z.array(
    z.object({
      inventoryItemId: z.string().uuid(),
      quantity: z.number().int().min(1),
    })
  ).min(1),
});

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);

    const transfers = await db.query.inventoryTransfer.findMany({
      where: eq(inventoryTransfer.organizationId, ctx.organizationId),
      orderBy: desc(inventoryTransfer.createdAt),
      with: {
        fromWarehouse: true,
        toWarehouse: true,
        lines: true,
      },
    });

    return NextResponse.json({ data: transfers });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:inventory");

    const body = await request.json();
    const parsed = createSchema.parse(body);

    const [transfer] = await db
      .insert(inventoryTransfer)
      .values({
        organizationId: ctx.organizationId,
        fromWarehouseId: parsed.fromWarehouseId,
        toWarehouseId: parsed.toWarehouseId,
        notes: parsed.notes,
        transferredBy: ctx.userId,
      })
      .returning();

    if (parsed.lines.length > 0) {
      await db.insert(inventoryTransferLine).values(
        parsed.lines.map((line) => ({
          transferId: transfer.id,
          inventoryItemId: line.inventoryItemId,
          quantity: line.quantity,
        }))
      );
    }

    const full = await db.query.inventoryTransfer.findFirst({
      where: eq(inventoryTransfer.id, transfer.id),
      with: { fromWarehouse: true, toWarehouse: true, lines: true },
    });

    return NextResponse.json({ transfer: full }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
