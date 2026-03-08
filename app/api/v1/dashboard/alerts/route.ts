import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  invoice,
  bill,
  bankAccount,
  bankTransaction,
  bankReconciliation,
} from "@/lib/db/schema";
import { eq, and, sql, lt, notInArray, isNull } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError } from "@/lib/api/response";

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const today = new Date().toISOString().slice(0, 10);

    // Overdue invoices
    const [overdueInvoices] = await db
      .select({
        count: sql<number>`COUNT(*)`,
        total: sql<number>`COALESCE(SUM(${invoice.amountDue}), 0)`,
      })
      .from(invoice)
      .where(
        and(
          eq(invoice.organizationId, ctx.organizationId),
          notInArray(invoice.status, ["draft", "void", "paid"]),
          lt(invoice.dueDate, today),
          isNull(invoice.deletedAt)
        )
      );

    // Overdue bills
    const [overdueBills] = await db
      .select({
        count: sql<number>`COUNT(*)`,
        total: sql<number>`COALESCE(SUM(${bill.amountDue}), 0)`,
      })
      .from(bill)
      .where(
        and(
          eq(bill.organizationId, ctx.organizationId),
          notInArray(bill.status, ["draft", "void", "paid"]),
          lt(bill.dueDate, today),
          isNull(bill.deletedAt)
        )
      );

    // Uncategorized bank transactions
    const [uncategorized] = await db
      .select({
        count: sql<number>`COUNT(*)`,
      })
      .from(bankTransaction)
      .innerJoin(bankAccount, eq(bankTransaction.bankAccountId, bankAccount.id))
      .where(
        and(
          eq(bankAccount.organizationId, ctx.organizationId),
          isNull(bankTransaction.accountId),
          eq(bankTransaction.status, "unreconciled")
        )
      );

    // Bank accounts needing reconciliation
    const accounts = await db.query.bankAccount.findMany({
      where: and(
        eq(bankAccount.organizationId, ctx.organizationId),
        eq(bankAccount.isActive, true),
        isNull(bankAccount.deletedAt)
      ),
    });

    const reconStatus = await Promise.all(
      accounts.map(async (acc) => {
        const lastRecon = await db.query.bankReconciliation.findFirst({
          where: and(
            eq(bankReconciliation.bankAccountId, acc.id),
            eq(bankReconciliation.status, "completed")
          ),
          orderBy: (r, { desc }) => desc(r.endDate),
        });
        return {
          bankAccountId: acc.id,
          bankAccountName: acc.accountName,
          lastReconDate: lastRecon?.endDate || null,
        };
      })
    );

    const needsRecon = reconStatus.filter((r) => {
      if (!r.lastReconDate) return true;
      const lastDate = new Date(r.lastReconDate);
      const daysSince = Math.floor(
        (Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      return daysSince > 30;
    });

    return NextResponse.json({
      overdueInvoices: {
        count: Number(overdueInvoices?.count || 0),
        total: Number(overdueInvoices?.total || 0),
      },
      overdueBills: {
        count: Number(overdueBills?.count || 0),
        total: Number(overdueBills?.total || 0),
      },
      uncategorizedTransactions: Number(uncategorized?.count || 0),
      accountsNeedingReconciliation: needsRecon,
    });
  } catch (err) {
    return handleError(err);
  }
}
