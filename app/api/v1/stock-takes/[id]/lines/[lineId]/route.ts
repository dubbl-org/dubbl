import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { recordStockTakeCount } from "@/lib/api/stock-takes";
import { z } from "zod";

const updateLineSchema = z.object({
  countedQuantity: z.number().int().min(0),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; lineId: string }> }
) {
  try {
    const { id, lineId } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:inventory");
    const parsed = updateLineSchema.parse(await request.json());
    const line = await recordStockTakeCount(ctx, id, { lineId }, parsed.countedQuantity);
    return NextResponse.json({ line });
  } catch (err) {
    return handleError(err);
  }
}
