import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import {
  cancelStockTake,
  deleteStockTake,
  getStockTake,
  startStockTake,
  updateStockTakeDetails,
} from "@/lib/api/stock-takes";
import { z } from "zod";

// Completing goes through POST /apply, which posts the adjustments.
const updateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  notes: z.string().nullable().optional(),
  status: z.enum(["in_progress", "cancelled"]).optional(),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    const st = await getStockTake(ctx.organizationId, id);
    if (!st) return notFound("Stock take");
    return NextResponse.json({ stockTake: st });
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
    const { status, ...details } = updateSchema.parse(await request.json());

    let st = null;
    if (details.name !== undefined || details.notes !== undefined) {
      st = await updateStockTakeDetails(ctx, id, details);
    }
    if (status === "in_progress") st = await startStockTake(ctx, id);
    if (status === "cancelled") st = await cancelStockTake(ctx, id);
    if (!st) st = await getStockTake(ctx.organizationId, id);
    if (!st) return notFound("Stock take");

    logAudit({ ctx, action: status ? `stock_take.${status}` : "update", entityType: "stock_take", entityId: id, changes: { status, ...details }, request });
    return NextResponse.json({ stockTake: st });
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
    const removed = await deleteStockTake(ctx, id);
    logAudit({ ctx, action: "delete", entityType: "stock_take", entityId: id, changes: { name: removed.name }, request });
    return NextResponse.json({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
