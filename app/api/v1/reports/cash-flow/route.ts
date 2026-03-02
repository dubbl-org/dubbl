import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { journalEntry, journalLine, chartAccount } from "@/lib/db/schema";
import { eq, and, isNull, gte, lte, sql } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError } from "@/lib/api/response";

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const url = new URL(request.url);
    const startDate = url.searchParams.get("startDate") || `${new Date().getFullYear()}-01-01`;
    const endDate = url.searchParams.get("endDate") || new Date().toISOString().slice(0, 10);

    const entries = await db
      .select({
        accountId: journalLine.accountId,
        accountName: chartAccount.name,
        accountCode: chartAccount.code,
        accountType: chartAccount.type,
        subType: chartAccount.subType,
        debit: sql<number>`COALESCE(SUM(${journalLine.debitAmount}), 0)`.as("debit"),
        credit: sql<number>`COALESCE(SUM(${journalLine.creditAmount}), 0)`.as("credit"),
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
      .groupBy(
        journalLine.accountId,
        chartAccount.name,
        chartAccount.code,
        chartAccount.type,
        chartAccount.subType
      );

    // Classify accounts into cash flow sections by type and subType
    const operating: { accountName: string; accountCode: string; amount: number }[] = [];
    const investing: { accountName: string; accountCode: string; amount: number }[] = [];
    const financing: { accountName: string; accountCode: string; amount: number }[] = [];

    for (const row of entries) {
      const debit = Number(row.debit);
      const credit = Number(row.credit);
      const net = credit - debit;

      const item = {
        accountName: row.accountName,
        accountCode: row.accountCode,
        amount: net,
      };

      // Classify based on account type and sub-type
      const sub = (row.subType || "").toLowerCase();
      if (row.accountType === "revenue" || row.accountType === "expense") {
        operating.push(item);
      } else if (
        sub.includes("fixed") ||
        sub.includes("investment") ||
        sub.includes("property") ||
        sub.includes("equipment")
      ) {
        investing.push(item);
      } else if (
        sub.includes("loan") ||
        sub.includes("equity") ||
        sub.includes("dividend") ||
        row.accountType === "equity"
      ) {
        financing.push(item);
      } else {
        operating.push(item);
      }
    }

    const totalOperating = operating.reduce((s, r) => s + r.amount, 0);
    const totalInvesting = investing.reduce((s, r) => s + r.amount, 0);
    const totalFinancing = financing.reduce((s, r) => s + r.amount, 0);
    const netCashFlow = totalOperating + totalInvesting + totalFinancing;

    return NextResponse.json({
      startDate,
      endDate,
      operating,
      totalOperating,
      investing,
      totalInvesting,
      financing,
      totalFinancing,
      netCashFlow,
    });
  } catch (err) {
    return handleError(err);
  }
}
