import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { landedCostAllocation, landedCostComponent } from "@/lib/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { parsePagination, paginatedResponse } from "@/lib/api/pagination";
import { z } from "zod";

const componentSchema = z.object({
  description: z.string().min(1),
  amount: z.number().min(0),
  accountId: z.string().nullable().optional(),
});

const createSchema = z.object({
  name: z.string().min(1),
  billId: z.string().nullable().optional(),
  purchaseOrderId: z.string().nullable().optional(),
  allocationMethod: z.enum(["by_value", "by_quantity", "by_weight", "manual"]).default("by_value"),
  currencyCode: z.string().default("USD"),
  components: z.array(componentSchema).min(1),
});

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const url = new URL(request.url);
    const { page, limit, offset } = parsePagination(url);

    const conditions = [
      eq(landedCostAllocation.organizationId, ctx.organizationId),
      notDeleted(landedCostAllocation.deletedAt),
    ];

    const items = await db.query.landedCostAllocation.findMany({
      where: and(...conditions),
      orderBy: desc(landedCostAllocation.createdAt),
      limit,
      offset,
      with: { components: true, bill: true, purchaseOrder: true },
    });

    const [countResult] = await db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(landedCostAllocation)
      .where(and(...conditions));

    return NextResponse.json(
      paginatedResponse(items, Number(countResult?.count || 0), page, limit)
    );
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:purchases");
    const body = await request.json();
    const parsed = createSchema.parse(body);

    const totalCostAmount = parsed.components.reduce((sum, c) => sum + Math.round(c.amount * 100), 0);

    const [created] = await db
      .insert(landedCostAllocation)
      .values({
        organizationId: ctx.organizationId,
        name: parsed.name,
        billId: parsed.billId || null,
        purchaseOrderId: parsed.purchaseOrderId || null,
        allocationMethod: parsed.allocationMethod,
        totalCostAmount,
        currencyCode: parsed.currencyCode,
        createdBy: ctx.userId,
      })
      .returning();

    await db.insert(landedCostComponent).values(
      parsed.components.map(c => ({
        allocationId: created.id,
        description: c.description,
        amount: Math.round(c.amount * 100),
        accountId: c.accountId || null,
      }))
    );

    return NextResponse.json({ allocation: created }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
