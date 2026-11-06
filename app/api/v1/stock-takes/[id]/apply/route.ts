import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { applyStockTake } from "@/lib/api/stock-takes";

/**
 * Apply a stocktake: correct stock to the counts (against the location's stock
 * for a location stocktake) and post the value of every difference.
 * See lib/api/stock-takes.ts.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:inventory");

    const result = await applyStockTake(ctx, id);

    await logAudit({
      ctx,
      action: "stock_take.apply",
      entityType: "stock_take",
      entityId: id,
      changes: { adjustedCount: result.adjustedCount, journalEntryIds: result.journalEntryIds },
      request,
    });

    return NextResponse.json(result);
  } catch (err) {
    return handleError(err);
  }
}
