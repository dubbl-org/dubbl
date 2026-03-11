import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { landedCostAllocation, landedCostLineAllocation, purchaseOrderLine } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:purchases");
    const { id } = await params;

    const allocation = await db.query.landedCostAllocation.findFirst({
      where: and(
        eq(landedCostAllocation.id, id),
        eq(landedCostAllocation.organizationId, ctx.organizationId),
        eq(landedCostAllocation.status, "draft"),
        notDeleted(landedCostAllocation.deletedAt)
      ),
      with: { components: true },
    });

    if (!allocation) return notFound("Draft landed cost allocation");
    if (!allocation.purchaseOrderId) {
      return NextResponse.json({ error: "Purchase order required for allocation" }, { status: 400 });
    }

    // Get PO lines
    const poLines = await db.query.purchaseOrderLine.findMany({
      where: eq(purchaseOrderLine.purchaseOrderId, allocation.purchaseOrderId),
    });

    if (poLines.length === 0) {
      return NextResponse.json({ error: "No purchase order lines found" }, { status: 400 });
    }

    // Calculate allocation basis
    const totalBasis = allocation.allocationMethod === "by_quantity"
      ? poLines.reduce((sum, l) => sum + l.quantity, 0)
      : poLines.reduce((sum, l) => sum + l.amount, 0); // by_value default

    // Allocate each component across PO lines
    const lineAllocations = [];
    for (const component of allocation.components) {
      for (const poLine of poLines) {
        const basis = allocation.allocationMethod === "by_quantity"
          ? poLine.quantity
          : poLine.amount;
        const allocatedAmount = totalBasis > 0
          ? Math.round((component.amount * basis) / totalBasis)
          : 0;

        lineAllocations.push({
          allocationId: id,
          componentId: component.id,
          purchaseOrderLineId: poLine.id,
          allocatedAmount,
          allocationBasis: basis,
        });
      }
    }

    if (lineAllocations.length > 0) {
      await db.insert(landedCostLineAllocation).values(lineAllocations);
    }

    const [updated] = await db
      .update(landedCostAllocation)
      .set({ status: "allocated", allocatedAt: new Date(), updatedAt: new Date() })
      .where(eq(landedCostAllocation.id, id))
      .returning();

    return NextResponse.json({ allocation: updated, lineAllocations });
  } catch (err) {
    return handleError(err);
  }
}
