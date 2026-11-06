import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { parsePagination, paginatedResponse } from "@/lib/api/pagination";
import { z } from "zod";
import { currencyCodeSchema } from "@/lib/currency/zod";
import { createLandedCost, LANDED_COST_METHODS, listLandedCosts } from "@/lib/api/landed-costs";

// Amounts are integer cents.
const componentSchema = z.object({
  description: z.string().trim().min(1),
  amount: z.number().int().min(0),
  accountId: z.string().uuid().nullable().optional(),
});

const createSchema = z.object({
  name: z.string().trim().min(1),
  billId: z.string().uuid().nullable().optional(),
  purchaseOrderId: z.string().uuid().nullable().optional(),
  allocationMethod: z.enum(LANDED_COST_METHODS).default("by_value"),
  currencyCode: currencyCodeSchema.optional(),
  components: z.array(componentSchema).min(1),
});

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const { page, limit, offset } = parsePagination(new URL(request.url));
    const { items, total } = await listLandedCosts(ctx.organizationId, { limit, offset });
    return NextResponse.json(paginatedResponse(items, total, page, limit));
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:purchases");
    const parsed = createSchema.parse(await request.json());
    const created = await createLandedCost(ctx, parsed);
    if (created) {
      logAudit({ ctx, action: "create", entityType: "landed_cost", entityId: created.id, changes: { name: created.name, total: created.totalCostAmount }, request });
    }
    return NextResponse.json({ allocation: created }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
