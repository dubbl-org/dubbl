import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { z } from "zod";
import { allocateLandedCost } from "@/lib/api/landed-costs";

// For the "manual" method: the amount (cents) for each purchase order line.
const allocateSchema = z
  .object({
    manualAmounts: z
      .array(z.object({ purchaseOrderLineId: z.string().uuid(), amount: z.number().int().min(0) }))
      .optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })
  .default({});

/** Apply a landed cost: spread it across the PO lines and post it. See lib/api/landed-costs.ts. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:purchases");
    const { id } = await params;
    const text = await request.text();
    const parsed = allocateSchema.parse(text ? JSON.parse(text) : {});
    const result = await allocateLandedCost(ctx, id, parsed);

    await logAudit({
      ctx,
      action: "allocate",
      entityType: "landed_cost_allocation",
      entityId: id,
      changes: { journalEntryId: result.journalEntryId, addedToStock: result.addedToStock, toCostOfSales: result.toCostOfSales },
      request,
    });

    return NextResponse.json({
      ...result,
      lineAllocations: result.allocation?.lineAllocations ?? [],
    });
  } catch (err) {
    return handleError(err);
  }
}
