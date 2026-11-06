import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { createTransfer, listTransfers } from "@/lib/api/inventory-transfers";
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
    const transfers = await listTransfers(ctx.organizationId);
    return NextResponse.json({ data: transfers });
  } catch (err) {
    return handleError(err);
  }
}

/** Create a draft transfer. Stock moves when it's sent ("On the way") or completed. */
export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:inventory");

    const body = await request.json();
    const parsed = createSchema.parse(body);

    const transfer = await createTransfer(ctx, parsed);
    logAudit({ ctx, action: "create", entityType: "inventory_transfer", entityId: transfer!.id, request });

    return NextResponse.json({ transfer }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
