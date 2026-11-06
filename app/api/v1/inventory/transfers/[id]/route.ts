import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import {
  cancelTransfer,
  getTransfer,
  sendTransfer,
  updateTransferNotes,
} from "@/lib/api/inventory-transfers";
import { z } from "zod";

// status "in_transit" sends a draft (stock leaves the source location);
// "cancelled" cancels it (stock on the way goes back). Use POST .../complete to
// mark it arrived.
const updateSchema = z.object({
  status: z.enum(["in_transit", "cancelled"]).optional(),
  notes: z.string().nullable().optional(),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);

    const transfer = await getTransfer(ctx.organizationId, id);
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

    let transfer = await getTransfer(ctx.organizationId, id);
    if (!transfer) return notFound("Transfer");

    if (parsed.notes !== undefined) transfer = await updateTransferNotes(ctx, id, parsed.notes);
    if (parsed.status === "in_transit") transfer = await sendTransfer(ctx, id);
    if (parsed.status === "cancelled") transfer = await cancelTransfer(ctx, id);

    if (parsed.status) {
      logAudit({ ctx, action: parsed.status === "in_transit" ? "send" : "cancel", entityType: "inventory_transfer", entityId: id, request });
    }

    return NextResponse.json({ transfer });
  } catch (err) {
    return handleError(err);
  }
}
