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
        code: chartAccount.code,
        name: chartAccount.name,
        type: chartAccount.type,
        debitTotal: sql<number>`coalesce(sum(${journalLine.debitAmount}), 0)`,
        creditTotal: sql<number>`coalesce(sum(${journalLine.creditAmount}), 0)`,
      })
      .from(chartAccount)
      .leftJoin(journalLine, eq(journalLine.accountId, chartAccount.id))
      .leftJoin(
        journalEntry,
        and(
          eq(journalLine.journalEntryId, journalEntry.id),
          eq(journalEntry.status, "posted")
        )
      )
      .where(
        and(
          eq(chartAccount.organizationId, ctx.organizationId),
          sql`${chartAccount.type} in ('asset', 'liability', 'equity')`
        )
      )
      .groupBy(chartAccount.code, chartAccount.name, chartAccount.type)
      .orderBy(chartAccount.code);

    function buildSection(type: string) {
      const isDebitNormal = type === "asset";
      const filtered = accounts.filter((a) => a.type === type);
      const accts = filtered.map((a) => {
        const debit = Number(a.debitTotal);
        const credit = Number(a.creditTotal);
        const balance = isDebitNormal ? debit - credit : credit - debit;
        return { code: a.code, name: a.name, balance: centsToDecimal(balance) };
      });
      const totalCents = filtered.reduce((s, a) => {
        const debit = Number(a.debitTotal);
        const credit = Number(a.creditTotal);
        return s + (isDebitNormal ? debit - credit : credit - debit);
      }, 0);
      return { type, accounts: accts, total: centsToDecimal(totalCents) };
    }

    return NextResponse.json({
      assets: buildSection("asset"),
      liabilities: buildSection("liability"),
      equity: buildSection("equity"),
    });
  } catch (err) {
    return handleError(err);
  }
}
