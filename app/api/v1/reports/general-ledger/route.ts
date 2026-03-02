import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { journalEntry, journalLine, chartAccount } from "@/lib/db/schema";
import { eq, and, isNull, gte, lte, asc } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError } from "@/lib/api/response";

interface LedgerEntry {
  date: string;
  entryNumber: number;
  description: string;
  reference: string | null;
  debit: number;
  credit: number;
  runningBalance: number;
}

interface AccountLedger {
  accountId: string;
  accountName: string;
  accountCode: string;
  accountType: string;
  entries: LedgerEntry[];
  totalDebit: number;
  totalCredit: number;
  balance: number;
}

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const url = new URL(request.url);
    const startDate = url.searchParams.get("startDate") || `${new Date().getFullYear()}-01-01`;
    const endDate = url.searchParams.get("endDate") || new Date().toISOString().slice(0, 10);

    // Get all posted journal lines with their entries, ordered by date
    const rows = await db
      .select({
        accountId: journalLine.accountId,
        accountName: chartAccount.name,
        accountCode: chartAccount.code,
        accountType: chartAccount.type,
        date: journalEntry.date,
        entryNumber: journalEntry.entryNumber,
        description: journalEntry.description,
        reference: journalEntry.reference,
        debit: journalLine.debitAmount,
        credit: journalLine.creditAmount,
      })
      .from(journalLine)
      .innerJoin(journalEntry, eq(journalLine.journalEntryId, journalEntry.id))
      .innerJoin(chartAccount, eq(journalLine.accountId, chartAccount.id))
      .where(
        and(
          eq(journalEntry.organizationId, ctx.organizationId),
          eq(journalEntry.status, "posted"),
          isNull(journalEntry.deletedAt),
          gte(journalEntry.date, startDate),
          lte(journalEntry.date, endDate)
        )
      )
      .orderBy(asc(chartAccount.code), asc(journalEntry.date), asc(journalEntry.entryNumber));

    // Group by account
    const accountMap = new Map<string, AccountLedger>();

    for (const row of rows) {
      let ledger = accountMap.get(row.accountId);
      if (!ledger) {
        ledger = {
          accountId: row.accountId,
          accountName: row.accountName,
          accountCode: row.accountCode,
          accountType: row.accountType,
          entries: [],
          totalDebit: 0,
          totalCredit: 0,
          balance: 0,
        };
        accountMap.set(row.accountId, ledger);
      }

      // Compute running balance based on account type
      const isDebitNormal = row.accountType === "asset" || row.accountType === "expense";
      if (isDebitNormal) {
        ledger.balance += row.debit - row.credit;
      } else {
        ledger.balance += row.credit - row.debit;
      }

      ledger.entries.push({
        date: row.date,
        entryNumber: row.entryNumber,
        description: row.description,
        reference: row.reference,
        debit: row.debit,
        credit: row.credit,
        runningBalance: ledger.balance,
      });

      ledger.totalDebit += row.debit;
      ledger.totalCredit += row.credit;
    }

    const accounts = Array.from(accountMap.values()).sort((a, b) =>
      a.accountCode.localeCompare(b.accountCode)
    );

    return NextResponse.json({
      startDate,
      endDate,
      accounts,
    });
  } catch (err) {
    return handleError(err);
  }
}
