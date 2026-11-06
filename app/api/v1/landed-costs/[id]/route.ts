import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { currencyCodeSchema } from "@/lib/currency/zod";
import { z } from "zod";
import {
  deleteLandedCost,
  getLandedCost,
  LANDED_COST_METHODS,
  updateLandedCost,
} from "@/lib/api/landed-costs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getAuthContext(request);
    const { id } = await params;
    const item = await getLandedCost(ctx.organizationId, id);
    if (!item) return notFound("Landed cost allocation");
    return NextResponse.json(item);
  } catch (err) {
    return handleError(err);
  }
}

// Only a landed cost that hasn't been applied can change. Amounts are cents.
const updateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  billId: z.string().uuid().nullable().optional(),
  purchaseOrderId: z.string().uuid().nullable().optional(),
  allocationMethod: z.enum(LANDED_COST_METHODS).optional(),
  currencyCode: currencyCodeSchema.optional(),
  components: z
    .array(
      z.object({
        description: z.string().trim().min(1),
        amount: z.number().int().min(0),
        accountId: z.string().uuid().nullable().optional(),
      })
    )
    .min(1)
    .optional(),
});

async function update(request: Request, id: string) {
  const ctx = await getAuthContext(request);
  requireRole(ctx, "manage:purchases");
  const parsed = updateSchema.parse(await request.json());
  const updated = await updateLandedCost(ctx, id, parsed);
  logAudit({ ctx, action: "update", entityType: "landed_cost", entityId: id, changes: parsed, request });
  return NextResponse.json(updated);
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    return await update(request, id);
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
    return await update(request, id);
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:purchases");
    const { id } = await params;
    const deleted = await deleteLandedCost(ctx, id);
    logAudit({ ctx, action: "delete", entityType: "landed_cost", entityId: id, changes: deleted as Record<string, unknown>, request });
    return NextResponse.json({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
