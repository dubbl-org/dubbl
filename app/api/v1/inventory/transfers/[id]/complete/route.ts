import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { completeTransfer } from "@/lib/api/inventory-transfers";

/**
 * Mark a transfer as arrived. A draft is sent first (the source location must
 * hold enough stock); everything runs in one transaction.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:inventory");

    const transfer = await completeTransfer(ctx, id);
    logAudit({ ctx, action: "complete", entityType: "inventory_transfer", entityId: id, request });

    return NextResponse.json({ transfer });
  } catch (err) {
    return handleError(err);
  }
}
