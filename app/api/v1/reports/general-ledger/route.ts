import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { journalEntry, journalLine, chartAccount } from "@/lib/db/schema";
import { eq, and, isNull, gte, lte, asc, sql, count, sum } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError } from "@/lib/api/response";

const DEFAULT_ENTRIES_PER_ACCOUNT = 50;

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const url = new URL(request.url);
    const startDate = url.searchParams.get("startDate") || `${new Date().getFullYear()}-01-01`;
    const endDate = url.searchParams.get("endDate") || new Date().toISOString().slice(0, 10);
    // Optional: fetch entries for a single account with pagination
    const accountId = url.searchParams.get("accountId");
    const offset = Math.max(0, parseInt(url.searchParams.get("offset") || "0", 10) || 0);
    const limit = Math.min(500, Math.max(1, parseInt(url.searchParams.get("limit") || String(DEFAULT_ENTRIES_PER_ACCOUNT), 10) || DEFAULT_ENTRIES_PER_ACCOUNT));

    const baseWhere = and(
      eq(journalEntry.organizationId, ctx.organizationId),
      eq(journalEntry.status, "posted"),
      isNull(journalEntry.deletedAt),
      gte(journalEntry.date, startDate),
      lte(journalEntry.date, endDate)
    );

    // Single-account mode: return paginated entries for one account
    if (accountId) {
      const rows = await db
        .select({
          date: journalEntry.date,
          entryNumber: journalEntry.entryNumber,
          description: journalEntry.description,
          reference: journalEntry.reference,
          debit: journalLine.debitAmount,
          credit: journalLine.creditAmount,
          accountType: chartAccount.type,
        })
        .from(journalLine)
        .innerJoin(journalEntry, eq(journalLine.journalEntryId, journalEntry.id))
        .innerJoin(chartAccount, eq(journalLine.accountId, chartAccount.id))
        .where(and(baseWhere, eq(journalLine.accountId, accountId)))
        .orderBy(asc(journalEntry.date), asc(journalEntry.entryNumber))
        .offset(offset)
        .limit(limit);

      // Compute running balances starting from offset
      // If offset > 0, we need the balance up to that point
      let runningBalance = 0;
      if (offset > 0) {
        const priorRows = await db
          .select({
            debit: journalLine.debitAmount,
            credit: journalLine.creditAmount,
            accountType: chartAccount.type,
          })
          .from(journalLine)
          .innerJoin(journalEntry, eq(journalLine.journalEntryId, journalEntry.id))
          .innerJoin(chartAccount, eq(journalLine.accountId, chartAccount.id))
          .where(and(baseWhere, eq(journalLine.accountId, accountId)))
          .orderBy(asc(journalEntry.date), asc(journalEntry.entryNumber))
          .limit(offset);

        for (const r of priorRows) {
          const isDebitNormal = r.accountType === "asset" || r.accountType === "expense";
          runningBalance += isDebitNormal ? r.debit - r.credit : r.credit - r.debit;
        }
      }

      const entries = rows.map((row) => {
        const isDebitNormal = row.accountType === "asset" || row.accountType === "expense";
        runningBalance += isDebitNormal ? row.debit - row.credit : row.credit - row.debit;
        return {
          date: row.date,
          entryNumber: row.entryNumber,
          description: row.description,
          reference: row.reference,
          debit: row.debit,
          credit: row.credit,
          runningBalance,
        };
      });

      return NextResponse.json({ entries, offset, limit });
    }

    // Summary mode: return all accounts with totals + capped entries per account
    // First get per-account summaries
    const summaries = await db
      .select({
        accountId: journalLine.accountId,
        accountName: chartAccount.name,
        accountCode: chartAccount.code,
        accountType: chartAccount.type,
        totalDebit: sum(journalLine.debitAmount).mapWith(Number),
        totalCredit: sum(journalLine.creditAmount).mapWith(Number),
        entryCount: count(),
      })
      .from(journalLine)
      .innerJoin(journalEntry, eq(journalLine.journalEntryId, journalEntry.id))
      .innerJoin(chartAccount, eq(journalLine.accountId, chartAccount.id))
      .where(baseWhere)
      .groupBy(journalLine.accountId, chartAccount.name, chartAccount.code, chartAccount.type)
      .orderBy(asc(chartAccount.code));

    // Then fetch first N entries per account using a single query with row numbers
    const entriesRows = await db
      .select({
        accountId: journalLine.accountId,
        accountType: chartAccount.type,
        date: journalEntry.date,
        entryNumber: journalEntry.entryNumber,
        description: journalEntry.description,
        reference: journalEntry.reference,
        debit: journalLine.debitAmount,
        credit: journalLine.creditAmount,
        rn: sql<number>`ROW_NUMBER() OVER (PARTITION BY ${journalLine.accountId} ORDER BY ${journalEntry.date} ASC, ${journalEntry.entryNumber} ASC)`.as("rn"),
      })
      .from(journalLine)
      .innerJoin(journalEntry, eq(journalLine.journalEntryId, journalEntry.id))
      .innerJoin(chartAccount, eq(journalLine.accountId, chartAccount.id))
      .where(baseWhere)
      .orderBy(asc(chartAccount.code), asc(journalEntry.date), asc(journalEntry.entryNumber));

    // Group entries by account, capped at limit
    const entriesByAccount = new Map<string, typeof entriesRows>();
    for (const row of entriesRows) {
      if (row.rn > limit) continue;
      const existing = entriesByAccount.get(row.accountId) || [];
      existing.push(row);
      entriesByAccount.set(row.accountId, existing);
    }

    const accounts = summaries.map((s) => {
      const rows = entriesByAccount.get(s.accountId) || [];
      const isDebitNormal = s.accountType === "asset" || s.accountType === "expense";
      let runningBalance = 0;
      const entries = rows.map((row) => {
        runningBalance += isDebitNormal ? row.debit - row.credit : row.credit - row.debit;
        return {
          date: row.date,
          entryNumber: row.entryNumber,
          description: row.description,
          reference: row.reference,
          debit: row.debit,
          credit: row.credit,
          runningBalance,
        };
      });

      const balance = isDebitNormal
        ? (s.totalDebit || 0) - (s.totalCredit || 0)
        : (s.totalCredit || 0) - (s.totalDebit || 0);

      return {
        accountId: s.accountId,
        accountName: s.accountName,
        accountCode: s.accountCode,
        accountType: s.accountType,
        entries,
        totalEntries: s.entryCount,
        totalDebit: s.totalDebit || 0,
        totalCredit: s.totalCredit || 0,
        balance,
      };
    });

    return NextResponse.json({
      startDate,
      endDate,
      accounts,
    });
  } catch (err) {
    return handleError(err);
  }
}
