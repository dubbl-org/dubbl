import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bankTransaction, bankAccount } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { notDeleted } from "@/lib/db/soft-delete";

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
        { error: "Cannot exclude a reconciled transaction" },
        { status: 400 }
      );
    }

    const newStatus = transaction.status === "excluded" ? "unreconciled" : "excluded";

    const [updated] = await db
      .update(bankTransaction)
      .set({ status: newStatus })
      .where(eq(bankTransaction.id, id))
      .returning();

    logAudit({ ctx, action: newStatus === "excluded" ? "exclude" : "restore", entityType: "bank_transaction", entityId: id, changes: { previousStatus: transaction.status }, request });

    return NextResponse.json({ transaction: updated });
  } catch (err) {
    return handleError(err);
  }
}
