import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bankTransaction, bankAccount, auditLog } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { z } from "zod";

const reconcileSchema = z.object({
  reconciliationId: z.string().nullable().optional(),
  journalEntryId: z.string().nullable().optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:banking");

    // Find the transaction and verify ownership through bank account
    const transaction = await db.query.bankTransaction.findFirst({
      where: eq(bankTransaction.id, id),
      with: { bankAccount: true },
    });

    if (!transaction) return notFound("Bank transaction");

    // Verify the bank account belongs to this organization
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
        { error: "Transaction is already reconciled" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const parsed = reconcileSchema.parse(body);

    const [updated] = await db
      .update(bankTransaction)
      .set({
        status: "reconciled",
        reconciliationId: parsed.reconciliationId || null,
        journalEntryId: parsed.journalEntryId || null,
      })
      .where(eq(bankTransaction.id, id))
      .returning();

    await db.insert(auditLog).values({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: "reconciled",
      entityType: "bank_transaction",
      entityId: id,
      changes: {
        previousStatus: transaction.status,
        reconciliationId: parsed.reconciliationId || null,
      },
    });

    return NextResponse.json({ transaction: updated });
  } catch (err) {
    return handleError(err);
  }
}
