import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { paymentBatch, paymentBatchItem, bill } from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { z } from "zod";
import { currencyCodeSchema } from "@/lib/currency/zod";
import { checkPaymentBankAccount } from "@/lib/api/payment-bank-account";

const addItemSchema = z.object({
  billId: z.string().min(1),
  contactId: z.string().min(1),
  amount: z.number().int().positive(),
  currencyCode: currencyCodeSchema.default("USD"),
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  // Change the bank account the batch pays from; null = the default bank
  // ledger account (1100).
  bankAccountId: z.string().uuid().nullable().optional(),
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
        bankAccount: { columns: { id: true, accountName: true, currencyCode: true } },
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

    // The bank account must be able to pay every bill left in the batch.
    const bankAccountId =
      parsed.bankAccountId !== undefined ? parsed.bankAccountId : existing.bankAccountId;
    if (bankAccountId) {
      const removed = new Set(parsed.removeItemIds ?? []);
      const billIds = [
        ...existing.items.filter((i) => !removed.has(i.id)).map((i) => i.billId),
        ...(parsed.addItems ?? []).map((i) => i.billId),
      ].filter((b): b is string => !!b);
      const bills = billIds.length
        ? await db.query.bill.findMany({
            where: and(eq(bill.organizationId, ctx.organizationId), inArray(bill.id, billIds)),
            columns: { currencyCode: true },
          })
        : [];
      const bankError = await checkPaymentBankAccount(
        ctx.organizationId,
        bankAccountId,
        bills.map((b) => b.currencyCode)
      );
      if (bankError) {
        return NextResponse.json({ error: bankError }, { status: 400 });
      }
    }
    if (parsed.bankAccountId !== undefined) {
      await db
        .update(paymentBatch)
        .set({ bankAccountId: parsed.bankAccountId })
        .where(eq(paymentBatch.id, id));
    }

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
        bankAccount: { columns: { id: true, accountName: true, currencyCode: true } },
      },
    });

    return NextResponse.json({ batch: result });
  } catch (err) {
    return handleError(err);
  }
}
