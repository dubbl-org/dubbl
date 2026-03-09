import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { stockTake, stockTakeLine } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
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

    // Verify stock take exists and belongs to org
    const st = await db.query.stockTake.findFirst({
      where: and(
        eq(stockTake.id, id),
        eq(stockTake.organizationId, ctx.organizationId)
      ),
    });

    if (!st) {
      return notFound("Stock take");
    }

    if (st.status !== "in_progress") {
      return NextResponse.json(
        { error: "Stock take must be in progress to update line counts" },
        { status: 400 }
      );
    }

    // Get the line
    const line = await db.query.stockTakeLine.findFirst({
      where: and(
        eq(stockTakeLine.id, lineId),
        eq(stockTakeLine.stockTakeId, id)
      ),
    });

    if (!line) {
      return notFound("Stock take line");
    }

    const body = await request.json();
    const parsed = updateLineSchema.parse(body);

    const discrepancy = parsed.countedQuantity - line.expectedQuantity;

    const [updated] = await db
      .update(stockTakeLine)
      .set({
        countedQuantity: parsed.countedQuantity,
        discrepancy,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(stockTakeLine.id, lineId),
          eq(stockTakeLine.stockTakeId, id)
        )
      )
      .returning();

    return NextResponse.json({ line: updated });
  } catch (err) {
    return handleError(err);
  }
}
