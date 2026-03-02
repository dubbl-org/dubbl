import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { chartAccount, journalLine, journalEntry } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError } from "@/lib/api/response";
import { centsToDecimal } from "@/lib/money";

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);

    const accounts = await db
      .select({
        accountId: chartAccount.id,
        code: chartAccount.code,
        name: chartAccount.name,
        type: chartAccount.type,
        debitTotal: sql<number>`coalesce(sum(${journalLine.debitAmount}), 0)`,
        creditTotal: sql<number>`coalesce(sum(${journalLine.creditAmount}), 0)`,
      })
      .from(chartAccount)
      .leftJoin(
        journalLine,
        eq(journalLine.accountId, chartAccount.id)
      )
      .leftJoin(
        journalEntry,
        and(
          eq(journalLine.journalEntryId, journalEntry.id),
          eq(journalEntry.status, "posted")
        )
      )
      .where(eq(chartAccount.organizationId, ctx.organizationId))
      .groupBy(chartAccount.id, chartAccount.code, chartAccount.name, chartAccount.type)
      .orderBy(chartAccount.code);

    const result = accounts.map((a) => {
      const debit = Number(a.debitTotal);
      const credit = Number(a.creditTotal);
      const isDebitNormal = ["asset", "expense"].includes(a.type);
      const balance = isDebitNormal ? debit - credit : credit - debit;

      return {
        accountId: a.accountId,
        code: a.code,
        name: a.name,
        type: a.type,
        debitBalance: balance > 0 ? centsToDecimal(balance) : "0.00",
        creditBalance: balance < 0 ? centsToDecimal(Math.abs(balance)) : "0.00",
        balance: centsToDecimal(balance),
      };
    });

    return NextResponse.json({ accounts: result });
  } catch (err) {
    return handleError(err);
  }
}
