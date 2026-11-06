import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { createStockTake, listStockTakes } from "@/lib/api/stock-takes";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().trim().min(1),
  warehouseId: z.string().uuid().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    return NextResponse.json({ stockTakes: await listStockTakes(ctx.organizationId) });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:inventory");
    const parsed = createSchema.parse(await request.json());
    const created = await createStockTake(ctx, parsed);
    if (created) {
      logAudit({ ctx, action: "create", entityType: "stock_take", entityId: created.id, changes: { name: created.name }, request });
    }
    return NextResponse.json({ stockTake: created }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
