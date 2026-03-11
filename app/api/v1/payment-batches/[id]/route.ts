import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { paymentBatch, paymentBatchItem } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { z } from "zod";

const addItemSchema = z.object({
  billId: z.string().min(1),
  contactId: z.string().min(1),
  amount: z.number().int().positive(),
  currencyCode: z.string().default("USD"),
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  addItems: z.array(addItemSchema).optional(),
  removeItemIds: z.array(z.string()).optional(),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);

    const found = await db.query.paymentBatch.findFirst({
      where: and(
        eq(paymentBatch.id, id),
        eq(paymentBatch.organizationId, ctx.organizationId),
        notDeleted(paymentBatch.deletedAt)
      ),
      with: {
        items: {
          with: {
            bill: { with: { contact: true } },
            contact: true,
          },
        },
      },
    });

    if (!found) return notFound("Payment batch");
    return NextResponse.json({ batch: found });
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
    requireRole(ctx, "manage:payments");

    const existing = await db.query.paymentBatch.findFirst({
      where: and(
        eq(paymentBatch.id, id),
        eq(paymentBatch.organizationId, ctx.organizationId),
        notDeleted(paymentBatch.deletedAt)
      ),
      with: { items: true },
    });

    if (!existing) return notFound("Payment batch");

    if (existing.status !== "draft") {
      return NextResponse.json(
        { error: "Only draft batches can be updated" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const parsed = updateSchema.parse(body);

    // Update batch name
    if (parsed.name) {
      await db
        .update(paymentBatch)
        .set({ name: parsed.name })
        .where(eq(paymentBatch.id, id));
    }

    // Remove items
    if (parsed.removeItemIds && parsed.removeItemIds.length > 0) {
      for (const itemId of parsed.removeItemIds) {
        await db
          .delete(paymentBatchItem)
          .where(
            and(
              eq(paymentBatchItem.id, itemId),
              eq(paymentBatchItem.batchId, id)
            )
          );
      }
    }

    // Add items
    if (parsed.addItems && parsed.addItems.length > 0) {
      await db.insert(paymentBatchItem).values(
        parsed.addItems.map((item) => ({
          batchId: id,
          billId: item.billId,
          contactId: item.contactId,
          amount: item.amount,
          currencyCode: item.currencyCode,
        }))
      );
    }

    // Recalculate totals
    const updatedBatch = await db.query.paymentBatch.findFirst({
      where: eq(paymentBatch.id, id),
      with: { items: true },
    });

    if (updatedBatch) {
      const totalAmount = updatedBatch.items.reduce(
        (sum, item) => sum + item.amount,
        0
      );
      await db
        .update(paymentBatch)
        .set({
          totalAmount,
          paymentCount: updatedBatch.items.length,
        })
        .where(eq(paymentBatch.id, id));
    }

    const result = await db.query.paymentBatch.findFirst({
      where: eq(paymentBatch.id, id),
      with: {
        items: {
          with: {
            bill: { with: { contact: true } },
            contact: true,
          },
        },
      },
    });

    return NextResponse.json({ batch: result });
  } catch (err) {
    return handleError(err);
  }
}
