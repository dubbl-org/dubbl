import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bankAccount, bankTransaction, bankStatementImport, bankReconciliation } from "@/lib/db/schema";
import { eq, and, desc, sql, count } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);

    // Get all active, non-deleted bank accounts for the org
    const accounts = await db
      .select()
      .from(bankAccount)
      .where(
        and(
          eq(bankAccount.organizationId, ctx.organizationId),
          eq(bankAccount.isActive, true),
          notDeleted(bankAccount.deletedAt)
        )
      );

    const result = [];

    for (const account of accounts) {
      // Count unreconciled transactions grouped by age buckets
      const aging = await db
        .select({
          bucket: sql<string>`
            CASE
              WHEN CURRENT_DATE - ${bankTransaction.date}::date BETWEEN 0 AND 7 THEN 'week'
              WHEN CURRENT_DATE - ${bankTransaction.date}::date BETWEEN 8 AND 30 THEN 'month'
              WHEN CURRENT_DATE - ${bankTransaction.date}::date BETWEEN 31 AND 60 THEN 'twoMonths'
              ELSE 'older'
            END
          `.as("bucket"),
          count: count().as("count"),
          total: sql<number>`COALESCE(SUM(ABS(${bankTransaction.amount})), 0)`.as("total"),
        })
        .from(bankTransaction)
        .where(
          and(
            eq(bankTransaction.bankAccountId, account.id),
            eq(bankTransaction.status, "unreconciled")
          )
        )
        .groupBy(sql`CASE
          WHEN CURRENT_DATE - ${bankTransaction.date}::date BETWEEN 0 AND 7 THEN 'week'
          WHEN CURRENT_DATE - ${bankTransaction.date}::date BETWEEN 8 AND 30 THEN 'month'
          WHEN CURRENT_DATE - ${bankTransaction.date}::date BETWEEN 31 AND 60 THEN 'twoMonths'
          ELSE 'older'
        END`);

      const agingMap: Record<string, { count: number; total: number }> = {
        week: { count: 0, total: 0 },
        month: { count: 0, total: 0 },
        twoMonths: { count: 0, total: 0 },
        older: { count: 0, total: 0 },
      };

      let unreconciledTotal = 0;
      let unreconciledCount = 0;

      for (const row of aging) {
        const bucket = row.bucket.trim();
        agingMap[bucket] = {
          count: Number(row.count),
          total: Number(row.total),
        };
        unreconciledTotal += Number(row.total);
        unreconciledCount += Number(row.count);
      }

      // Get total of all transaction amounts for balance discrepancy check
      const [txnSum] = await db
        .select({
          total: sql<number>`COALESCE(SUM(${bankTransaction.amount}), 0)`.as("total"),
        })
        .from(bankTransaction)
        .where(
          and(
            eq(bankTransaction.bankAccountId, account.id),
            sql`${bankTransaction.status} != 'excluded'`
          )
        );

      // Get last import info
      const [lastImport] = await db
        .select({
          date: bankStatementImport.createdAt,
          fileName: bankStatementImport.fileName,
          endDate: bankStatementImport.statementEndDate,
        })
        .from(bankStatementImport)
        .where(eq(bankStatementImport.bankAccountId, account.id))
        .orderBy(desc(bankStatementImport.createdAt))
        .limit(1);

      // Get latest transaction date
      const [latestTxn] = await db
        .select({
          date: sql<string>`MAX(${bankTransaction.date})`.as("date"),
        })
        .from(bankTransaction)
        .where(eq(bankTransaction.bankAccountId, account.id));

      // Get last reconciliation session
      const [lastRecon] = await db
        .select({
          endDate: bankReconciliation.endDate,
          status: bankReconciliation.status,
        })
        .from(bankReconciliation)
        .where(eq(bankReconciliation.bankAccountId, account.id))
        .orderBy(desc(bankReconciliation.createdAt))
        .limit(1);

      // Detect gaps between last import end date and latest transaction date
      let gaps: { hasGap: boolean; gapStart: string | null; gapEnd: string | null; gapDays: number | null } = {
        hasGap: false,
        gapStart: null,
        gapEnd: null,
        gapDays: null,
      };

      if (lastImport?.endDate && latestTxn?.date) {
        const importEnd = new Date(lastImport.endDate);
        const latestDate = new Date(latestTxn.date);
        const diffMs = latestDate.getTime() - importEnd.getTime();
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        if (diffDays > 1) {
          gaps = {
            hasGap: true,
            gapStart: lastImport.endDate,
            gapEnd: latestTxn.date,
            gapDays: diffDays,
          };
        }
      }

      result.push({
        id: account.id,
        accountName: account.accountName,
        balance: account.balance,
        balanceDiscrepancy: account.balance - Number(txnSum?.total ?? 0),
        unreconciled: {
          total: unreconciledTotal,
          count: unreconciledCount,
          aging: agingMap,
        },
        lastImport: lastImport
          ? { date: lastImport.date, fileName: lastImport.fileName }
          : null,
        lastReconciliation: lastRecon
          ? { endDate: lastRecon.endDate, status: lastRecon.status }
          : null,
        gaps,
      });
    }

    return NextResponse.json({ accounts: result });
  } catch (err) {
    return handleError(err);
  }
}
