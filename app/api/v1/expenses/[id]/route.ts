import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { expenseClaim, expenseItem } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { notDeleted, softDelete } from "@/lib/db/soft-delete";
import { decimalToCents } from "@/lib/money";
import { z } from "zod";

const itemSchema = z.object({
  id: z.string().optional(),
  date: z.string().min(1),
  description: z.string().min(1),
  amount: z.number().min(0),
  category: z.string().nullable().optional(),
  accountId: z.string().nullable().optional(),
  receiptFileKey: z.string().nullable().optional(),
  receiptFileName: z.string().nullable().optional(),
});

const updateSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  items: z.array(itemSchema).min(1).optional(),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);

    const found = await db.query.expenseClaim.findFirst({
      where: and(
        eq(expenseClaim.id, id),
        eq(expenseClaim.organizationId, ctx.organizationId),
        notDeleted(expenseClaim.deletedAt)
      ),
      with: {
        submittedByUser: true,
        approvedByUser: true,
        items: {
          with: { account: true },
          orderBy: (items, { asc }) => [asc(items.sortOrder)],
        },
      },
    });

    if (!found) return notFound("Expense claim");
    return NextResponse.json({ expenseClaim: found });
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
    requireRole(ctx, "manage:expenses");

    const existing = await db.query.expenseClaim.findFirst({
      where: and(
        eq(expenseClaim.id, id),
        eq(expenseClaim.organizationId, ctx.organizationId),
        notDeleted(expenseClaim.deletedAt)
      ),
    });

    if (!existing) return notFound("Expense claim");
    if (existing.status !== "draft") {
      return NextResponse.json(
        { error: "Only draft expense claims can be edited" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const parsed = updateSchema.parse(body);

    // If items are provided, replace them all
    if (parsed.items) {
      let totalAmount = 0;
      const processedItems = parsed.items.map((item, i) => {
        const amount = decimalToCents(item.amount);
        totalAmount += amount;
        return {
          expenseClaimId: id,
          date: item.date,
          description: item.description,
          amount,
          category: item.category || null,
          accountId: item.accountId || null,
          receiptFileKey: item.receiptFileKey || null,
          receiptFileName: item.receiptFileName || null,
          sortOrder: i,
        };
      });

      // Delete old items and insert new ones
      await db.delete(expenseItem).where(eq(expenseItem.expenseClaimId, id));
      await db.insert(expenseItem).values(processedItems);

      const [updated] = await db
        .update(expenseClaim)
        .set({
          title: parsed.title || existing.title,
          description: parsed.description !== undefined ? parsed.description : existing.description,
          totalAmount,
          updatedAt: new Date(),
        })
        .where(eq(expenseClaim.id, id))
        .returning();

      return NextResponse.json({ expenseClaim: updated });
    }

    // Update only claim fields
    const [updated] = await db
      .update(expenseClaim)
      .set({
        ...(parsed.title && { title: parsed.title }),
        ...(parsed.description !== undefined && { description: parsed.description }),
        updatedAt: new Date(),
      })
      .where(eq(expenseClaim.id, id))
      .returning();

    return NextResponse.json({ expenseClaim: updated });
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
    requireRole(ctx, "manage:expenses");

    const existing = await db.query.expenseClaim.findFirst({
      where: and(
        eq(expenseClaim.id, id),
        eq(expenseClaim.organizationId, ctx.organizationId),
        notDeleted(expenseClaim.deletedAt)
      ),
    });

    if (!existing) return notFound("Expense claim");
    if (existing.status !== "draft") {
      return NextResponse.json(
        { error: "Only draft expense claims can be deleted" },
        { status: 400 }
      );
    }

    await db.delete(expenseItem).where(eq(expenseItem.expenseClaimId, id));
    await db.update(expenseClaim).set(softDelete()).where(eq(expenseClaim.id, id));

    logAudit({
      ctx,
      action: "delete",
      entityType: "expense",
      entityId: id,
      changes: existing as Record<string, unknown>,
      request,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
