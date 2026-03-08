import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bankTransaction, bankAccount, auditLog } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";

export async function GET(
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

    // Query audit log for this transaction
    const entries = await db.query.auditLog.findMany({
      where: and(
        eq(auditLog.entityType, "bank_transaction"),
        eq(auditLog.entityId, id)
      ),
      orderBy: desc(auditLog.createdAt),
      with: {
        user: true,
      },
    });

    const activity = entries.map((entry) => ({
      id: entry.id,
      action: entry.action,
      changes: entry.changes,
      user: {
        id: entry.user.id,
        name: entry.user.name,
        email: entry.user.email,
      },
      createdAt: entry.createdAt,
    }));

    return NextResponse.json({ activity });
  } catch (err) {
    return handleError(err);
  }
}
