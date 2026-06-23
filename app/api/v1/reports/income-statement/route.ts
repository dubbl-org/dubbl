import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { chartAccount, journalLine, journalEntry } from "@/lib/db/schema";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError } from "@/lib/api/response";
import { centsToDecimal } from "@/lib/money";

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const url = new URL(request.url);
    // A P&L is always "for a period". Honor the from/to filters so the report
    // reflects the chosen range (a month, a quarter, a year) instead of silently
    // summing every posted entry since the beginning of time.
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");

    // Date filters live on the posted-entry join so an account with no entries
    // in range still renders (at zero) via the outer join.
    const postedInRange = and(
      eq(journalLine.journalEntryId, journalEntry.id),
      eq(journalEntry.status, "posted"),
      from ? gte(journalEntry.date, from) : undefined,
      to ? lte(journalEntry.date, to) : undefined
    );

    const accounts = await db
      .select({
        code: chartAccount.code,
        name: chartAccount.name,
        type: chartAccount.type,
        debitTotal: sql<number>`coalesce(sum(${journalLine.debitAmount}), 0)`,
        creditTotal: sql<number>`coalesce(sum(${journalLine.creditAmount}), 0)`,
      })
      .from(chartAccount)
      .leftJoin(journalLine, eq(journalLine.accountId, chartAccount.id))
      .leftJoin(journalEntry, postedInRange)
      .where(
        and(
          eq(chartAccount.organizationId, ctx.organizationId),
          sql`${chartAccount.type} in ('revenue', 'expense')`
        )
      )
      .groupBy(chartAccount.code, chartAccount.name, chartAccount.type)
      .orderBy(chartAccount.code);

    function buildSection(type: string) {
      const isExpense = type === "expense";
      const filtered = accounts.filter((a) => a.type === type);
      const accts = filtered.map((a) => {
        const debit = Number(a.debitTotal);
        const credit = Number(a.creditTotal);
        const balance = isExpense ? debit - credit : credit - debit;
        return { code: a.code, name: a.name, balance: centsToDecimal(balance) };
      });
      const totalCents = filtered.reduce((s, a) => {
        const debit = Number(a.debitTotal);
        const credit = Number(a.creditTotal);
        return s + (isExpense ? debit - credit : credit - debit);
      }, 0);
      return { accounts: accts, total: centsToDecimal(totalCents), totalCents };
    }

    const revenue = buildSection("revenue");
    const expenses = buildSection("expense");
    // Net income in integer cents (never float math on dollar strings).
    const netIncomeCents = revenue.totalCents - expenses.totalCents;

    return NextResponse.json({
      period: { from: from || null, to: to || null },
      revenue: { accounts: revenue.accounts, total: revenue.total },
      expenses: { accounts: expenses.accounts, total: expenses.total },
      netIncome: centsToDecimal(netIncomeCents),
    });
  } catch (err) {
    return handleError(err);
  }
}
