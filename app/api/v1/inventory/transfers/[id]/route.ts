import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { inventoryTransfer } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { z } from "zod";

const updateSchema = z.object({
  status: z.enum(["draft", "in_transit", "cancelled"]).optional(),
  notes: z.string().nullable().optional(),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);

    const transfer = await db.query.inventoryTransfer.findFirst({
      where: and(
        eq(inventoryTransfer.id, id),
        eq(inventoryTransfer.organizationId, ctx.organizationId)
      ),
      with: { fromWarehouse: true, toWarehouse: true, lines: true },
    });

    if (!transfer) return notFound("Transfer");

    return NextResponse.json({ transfer });
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
      .update(inventoryTransfer)
      .set(parsed)
      .where(
        and(
          eq(inventoryTransfer.id, id),
          eq(inventoryTransfer.organizationId, ctx.organizationId)
        )
      )
      .returning();

    if (!updated) return notFound("Transfer");

    const full = await db.query.inventoryTransfer.findFirst({
      where: eq(inventoryTransfer.id, updated.id),
      with: { fromWarehouse: true, toWarehouse: true, lines: true },
    });

    return NextResponse.json({ transfer: full });
  } catch (err) {
    return handleError(err);
  }
}
