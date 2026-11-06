import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { unlinkItemSupplier, updateItemSupplier } from "@/lib/api/inventory-suppliers";
import { z } from "zod";

const updateSchema = z.object({
  supplierCode: z.string().nullable().optional(),
  leadTimeDays: z.number().int().min(0).optional(),
  purchasePrice: z.number().int().min(0).optional(),
  isPreferred: z.boolean().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; supplierId: string }> }
) {
  try {
    const { id, supplierId } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:inventory");
    const parsed = updateSchema.parse(await request.json());
    const updated = await updateItemSupplier(ctx, id, supplierId, parsed);
    return NextResponse.json({ inventoryItemSupplier: updated });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; supplierId: string }> }
) {
  try {
    const { id, supplierId } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:inventory");
    await unlinkItemSupplier(ctx, id, supplierId);
    return NextResponse.json({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
