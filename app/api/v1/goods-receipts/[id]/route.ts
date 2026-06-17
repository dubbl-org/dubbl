import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { goodsReceipt } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError, notFound } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);

    const found = await db.query.goodsReceipt.findFirst({
      where: and(
        eq(goodsReceipt.id, id),
        eq(goodsReceipt.organizationId, ctx.organizationId),
        notDeleted(goodsReceipt.deletedAt)
      ),
      with: {
        contact: true,
        purchaseOrder: true,
        lines: {
          with: { inventoryItem: true, warehouse: true, purchaseOrderLine: true },
        },
      },
    });

    if (!found) return notFound("Goods receipt");
    return NextResponse.json({ goodsReceipt: found });
  } catch (err) {
    return handleError(err);
  }
}
