import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bankTransaction, bankAccount, expenseClaim, expenseItem } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { decimalToCents } from "@/lib/money";
import { z } from "zod";

const itemSchema = z.object({
  date: z.string().min(1),
  description: z.string().min(1),
  amount: z.number().min(0),
  category: z.string().nullable().optional(),
  accountId: z.string().nullable().optional(),
});

const createSchema = z.object({
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  currencyCode: z.string().default("USD"),
  items: z.array(itemSchema).min(1),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:expenses");

    // Verify transaction ownership
    const transaction = await db.query.bankTransaction.findFirst({
      where: eq(bankTransaction.id, id),
    });
    if (!transaction) return notFound("Bank transaction");

    const account = await db.query.bankAccount.findFirst({
      where: and(
        eq(bankAccount.id, transaction.bankAccountId),
        eq(bankAccount.organizationId, ctx.organizationId),
        notDeleted(bankAccount.deletedAt)
      ),
    });
    if (!account) return notFound("Bank transaction");

    if (transaction.status === "reconciled") {
      return NextResponse.json(
        { error: "Transaction already reconciled" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const parsed = createSchema.parse(body);

    // Calculate total from items
    let totalAmount = 0;
    const processedItems = parsed.items.map((item, i) => {
      const amount = decimalToCents(item.amount);
      totalAmount += amount;
      return {
        date: item.date,
        description: item.description,
        amount,
        category: item.category || null,
        accountId: item.accountId || null,
        receiptFileKey: null,
        receiptFileName: null,
        sortOrder: i,
      };
    });

    // Create expense claim
    const [created] = await db
      .insert(expenseClaim)
      .values({
        organizationId: ctx.organizationId,
        title: parsed.title,
        description: parsed.description || null,
        submittedBy: ctx.userId,
        totalAmount,
        currencyCode: parsed.currencyCode,
      })
      .returning();

    await db.insert(expenseItem).values(
      processedItems.map((item) => ({
        expenseClaimId: created.id,
        ...item,
      }))
    );

    // Mark bank transaction as reconciled
    await db
      .update(bankTransaction)
      .set({ status: "reconciled" })
      .where(eq(bankTransaction.id, id));

    return NextResponse.json({ expenseClaim: created }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
