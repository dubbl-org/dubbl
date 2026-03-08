import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { stockTake, stockTakeLine } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  notes: z.string().optional(),
  status: z.enum(["draft", "in_progress", "completed", "cancelled"]).optional(),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);

    const st = await db.query.stockTake.findFirst({
      where: and(
        eq(stockTake.id, id),
        eq(stockTake.organizationId, ctx.organizationId)
      ),
      with: {
        lines: {
          with: {
            inventoryItem: {
              columns: {
                id: true,
                name: true,
                code: true,
              },
            },
          },
        },
      },
    });

    if (!st) {
      return notFound("Stock take");
    }

    return NextResponse.json({ stockTake: st });
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
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:inventory");

    const body = await request.json();
    const parsed = updateSchema.parse(body);

    const existing = await db.query.stockTake.findFirst({
      where: and(
        eq(stockTake.id, id),
        eq(stockTake.organizationId, ctx.organizationId)
      ),
    });

    if (!existing) {
      return notFound("Stock take");
    }

    const updates: Record<string, unknown> = {
      ...parsed,
      updatedAt: new Date(),
    };

    if (parsed.status === "in_progress" && existing.status !== "in_progress") {
      updates.startedAt = new Date();
    }
    if (parsed.status === "completed" && existing.status !== "completed") {
      updates.completedAt = new Date();
    }

    const [updated] = await db
      .update(stockTake)
      .set(updates)
      .where(
        and(
          eq(stockTake.id, id),
          eq(stockTake.organizationId, ctx.organizationId)
        )
      )
      .returning();

    return NextResponse.json({ stockTake: updated });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:inventory");

    const existing = await db.query.stockTake.findFirst({
      where: and(
        eq(stockTake.id, id),
        eq(stockTake.organizationId, ctx.organizationId)
      ),
    });

    if (!existing) {
      return notFound("Stock take");
    }

    if (existing.status !== "draft") {
      return NextResponse.json(
        { error: "Can only delete stock takes in draft status" },
        { status: 400 }
      );
    }

    // Delete lines first, then the stock take
    await db.delete(stockTakeLine).where(eq(stockTakeLine.stockTakeId, id));
    await db
      .delete(stockTake)
      .where(
        and(
          eq(stockTake.id, id),
          eq(stockTake.organizationId, ctx.organizationId)
        )
      );

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
