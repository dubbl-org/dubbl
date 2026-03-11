import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { journalEntry, journalLine, chartAccount } from "@/lib/db/schema";
import { eq, and, gte, lte, isNull, sql } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError } from "@/lib/api/response";

// Map account subTypes to Schedule C line items
const SCHEDULE_C_MAP: Record<string, { line: string; label: string }> = {
  income: { line: "1", label: "Gross receipts or sales" },
  returns_allowances: { line: "2", label: "Returns and allowances" },
  advertising: { line: "8", label: "Advertising" },
  car_truck: { line: "9", label: "Car and truck expenses" },
  commissions: { line: "10", label: "Commissions and fees" },
  depreciation: { line: "13", label: "Depreciation" },
  insurance: { line: "15", label: "Insurance (other than health)" },
  interest_mortgage: { line: "16a", label: "Mortgage interest" },
  interest_other: { line: "16b", label: "Other interest" },
  legal_professional: { line: "17", label: "Legal and professional services" },
  office_expense: { line: "18", label: "Office expense" },
  rent_lease_vehicles: { line: "20a", label: "Rent/lease - vehicles, machinery" },
  rent_lease_other: { line: "20b", label: "Rent/lease - other business property" },
  repairs_maintenance: { line: "21", label: "Repairs and maintenance" },
  supplies: { line: "22", label: "Supplies" },
  taxes_licenses: { line: "23", label: "Taxes and licenses" },
  travel: { line: "24a", label: "Travel" },
  meals: { line: "24b", label: "Deductible meals" },
  utilities: { line: "25", label: "Utilities" },
  wages: { line: "26", label: "Wages" },
  other_expenses: { line: "27", label: "Other expenses" },
};

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const url = new URL(request.url);
    const startDate = url.searchParams.get("startDate") || "";
    const endDate = url.searchParams.get("endDate") || "";

    if (!startDate || !endDate) {
      return NextResponse.json({ error: "startDate and endDate required" }, { status: 400 });
    }

    // Get all posted journal lines with account info
    const lines = await db
      .select({
        subType: chartAccount.subType,
        accountType: chartAccount.type,
        debit: sql<number>`COALESCE(SUM(${journalLine.debitAmount}), 0)`.mapWith(Number),
        credit: sql<number>`COALESCE(SUM(${journalLine.creditAmount}), 0)`.mapWith(Number),
      })
      .from(journalLine)
      .innerJoin(journalEntry, eq(journalLine.journalEntryId, journalEntry.id))
      .innerJoin(chartAccount, eq(journalLine.accountId, chartAccount.id))
      .where(and(
        eq(journalEntry.organizationId, ctx.organizationId),
        eq(journalEntry.status, "posted"),
        gte(journalEntry.date, startDate),
        lte(journalEntry.date, endDate),
        isNull(journalEntry.deletedAt)
      ))
      .groupBy(chartAccount.subType, chartAccount.type);

    // Map to Schedule C lines
    const scheduleCLines: Array<{ line: string; label: string; amount: number }> = [];

    for (const row of lines) {
      const subType = row.subType || "";
      const mapping = SCHEDULE_C_MAP[subType];
      if (!mapping) continue;

      // Revenue: credit - debit; Expense: debit - credit
      const amount = row.accountType === "revenue"
        ? row.credit - row.debit
        : row.debit - row.credit;

      const existing = scheduleCLines.find(l => l.line === mapping.line);
      if (existing) {
        existing.amount += amount;
      } else {
        scheduleCLines.push({ ...mapping, amount });
      }
    }

    scheduleCLines.sort((a, b) => {
      const aNum = parseFloat(a.line.replace(/[a-z]/g, ""));
      const bNum = parseFloat(b.line.replace(/[a-z]/g, ""));
      return aNum - bNum;
    });

    const totalIncome = scheduleCLines
      .filter(l => l.line === "1")
      .reduce((sum, l) => sum + l.amount, 0);
    const totalExpenses = scheduleCLines
      .filter(l => l.line !== "1" && l.line !== "2")
      .reduce((sum, l) => sum + l.amount, 0);
    const netProfit = totalIncome - totalExpenses;

    return NextResponse.json({
      lines: scheduleCLines,
      totalIncome,
      totalExpenses,
      netProfit,
      period: { startDate, endDate },
    });
  } catch (err) {
    return handleError(err);
  }
}
