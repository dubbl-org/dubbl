import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bankAccount, bankTransaction, bankStatementImport } from "@/lib/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError, notFound } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);

    const account = await db.query.bankAccount.findFirst({
      where: and(
        eq(bankAccount.id, id),
        eq(bankAccount.organizationId, ctx.organizationId),
        notDeleted(bankAccount.deletedAt)
      ),
    });
    if (!account) return notFound("Bank account");

    // Sum all transaction amounts
    const [txSum] = await db
      .select({
        total: sql<number>`coalesce(sum(${bankTransaction.amount}), 0)::int`,
        count: sql<number>`count(*)::int`,
      })
      .from(bankTransaction)
      .where(eq(bankTransaction.bankAccountId, id));

    // Get latest transaction with a balance
    const latestWithBalance = await db.query.bankTransaction.findFirst({
      where: and(
        eq(bankTransaction.bankAccountId, id),
        sql`${bankTransaction.balance} IS NOT NULL`
      ),
      orderBy: desc(bankTransaction.date),
      columns: { id: true, date: true, balance: true, description: true },
    });

    // Get last import's closing balance
    const lastImport = await db.query.bankStatementImport.findFirst({
      where: eq(bankStatementImport.bankAccountId, id),
      orderBy: desc(bankStatementImport.createdAt),
      columns: {
        id: true,
        closingBalance: true,
        statementEndDate: true,
        fileName: true,
      },
    });

    const accountBalance = account.balance;
    const transactionSum = txSum?.total || 0;
    const latestTxBalance = latestWithBalance?.balance ?? null;
    const importClosingBalance = lastImport?.closingBalance ?? null;

    const issues: string[] = [];

    // Check if account balance matches latest transaction balance
    if (latestTxBalance !== null && accountBalance !== latestTxBalance) {
      issues.push(
        `Account balance (${accountBalance}) differs from latest transaction running balance (${latestTxBalance}) by ${accountBalance - latestTxBalance} cents`
      );
    }

    // Check if account balance matches import closing balance
    if (importClosingBalance !== null && accountBalance !== importClosingBalance) {
      issues.push(
        `Account balance (${accountBalance}) differs from last import closing balance (${importClosingBalance}) by ${accountBalance - importClosingBalance} cents`
      );
    }

    return NextResponse.json({
      bankAccountId: id,
      accountBalance,
      transactionSum,
      transactionCount: txSum?.count || 0,
      latestTransactionBalance: latestTxBalance,
      lastImportClosingBalance: importClosingBalance,
      lastImportDate: lastImport?.statementEndDate || null,
      isBalanced: issues.length === 0,
      issues,
    });
  } catch (err) {
    return handleError(err);
  }
}
