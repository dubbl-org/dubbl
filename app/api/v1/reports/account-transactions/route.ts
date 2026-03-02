import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { journalEntry, journalLine, chartAccount } from "@/lib/db/schema";
import { eq, and, isNull, gte, lte, asc } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError } from "@/lib/api/response";

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const url = new URL(request.url);
    const accountId = url.searchParams.get("accountId");
    const startDate = url.searchParams.get("startDate") || `${new Date().getFullYear()}-01-01`;
    const endDate = url.searchParams.get("endDate") || new Date().toISOString().slice(0, 10);

    if (!accountId) {
      return NextResponse.json({ error: "accountId is required" }, { status: 400 });
    }

    // Verify the account belongs to this org
    const account = await db.query.chartAccount.findFirst({
      where: and(
        eq(chartAccount.id, accountId),
        eq(chartAccount.organizationId, ctx.organizationId),
        isNull(chartAccount.deletedAt)
      ),
    });

    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const rows = await db
      .select({
        date: journalEntry.date,
        entryNumber: journalEntry.entryNumber,
        description: journalEntry.description,
        reference: journalEntry.reference,
        sourceType: journalEntry.sourceType,
        sourceId: journalEntry.sourceId,
        debit: journalLine.debitAmount,
        credit: journalLine.creditAmount,
        lineDescription: journalLine.description,
      })
      .from(journalLine)
      .innerJoin(journalEntry, eq(journalLine.journalEntryId, journalEntry.id))
      .where(
        and(
          eq(journalLine.accountId, accountId),
          eq(journalEntry.organizationId, ctx.organizationId),
          eq(journalEntry.status, "posted"),
          isNull(journalEntry.deletedAt),
          gte(journalEntry.date, startDate),
          lte(journalEntry.date, endDate)
        )
      )
      .orderBy(asc(journalEntry.date), asc(journalEntry.entryNumber));

    const isDebitNormal = account.type === "asset" || account.type === "expense";
    let runningBalance = 0;

    const transactions = rows.map((row) => {
      if (isDebitNormal) {
        runningBalance += row.debit - row.credit;
      } else {
        runningBalance += row.credit - row.debit;
      }

      return {
        date: row.date,
        entryNumber: row.entryNumber,
        description: row.lineDescription || row.description,
        reference: row.reference,
        sourceType: row.sourceType,
        sourceId: row.sourceId,
        debit: row.debit,
        credit: row.credit,
        runningBalance,
      };
    });

    const totalDebit = transactions.reduce((s, t) => s + t.debit, 0);
    const totalCredit = transactions.reduce((s, t) => s + t.credit, 0);

    return NextResponse.json({
      account: {
        id: account.id,
        name: account.name,
        code: account.code,
        type: account.type,
      },
      startDate,
      endDate,
      transactions,
      totalDebit,
      totalCredit,
      closingBalance: runningBalance,
    });
  } catch (err) {
    return handleError(err);
  }
}
