import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  payrollRun,
  journalEntry,
  journalLine,
  chartAccount,
} from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:payroll");

    const run = await db.query.payrollRun.findFirst({
      where: and(
        eq(payrollRun.id, id),
        eq(payrollRun.organizationId, ctx.organizationId),
        notDeleted(payrollRun.deletedAt)
      ),
      with: {
        items: {
          with: { employee: true },
        },
      },
    });

    if (!run) return notFound("Payroll run");

    if (run.status !== "draft") {
      return NextResponse.json(
        { error: "Only draft payroll runs can be processed" },
        { status: 400 }
      );
    }

    // Find relevant accounts for journal entry
    // Salary Expense (5100), Tax Payable (2200), Wages Payable / Bank (2300)
    const salaryAccount = await db.query.chartAccount.findFirst({
      where: and(
        eq(chartAccount.organizationId, ctx.organizationId),
        eq(chartAccount.code, "5100")
      ),
    });

    const taxPayableAccount = await db.query.chartAccount.findFirst({
      where: and(
        eq(chartAccount.organizationId, ctx.organizationId),
        eq(chartAccount.code, "2200")
      ),
    });

    const bankAccount = await db.query.chartAccount.findFirst({
      where: and(
        eq(chartAccount.organizationId, ctx.organizationId),
        eq(chartAccount.code, "1100")
      ),
    });

    let journalEntryId: string | null = null;

    if (salaryAccount && bankAccount) {
      const [maxResult] = await db
        .select({
          max: sql<number>`coalesce(max(${journalEntry.entryNumber}), 0)`,
        })
        .from(journalEntry)
        .where(eq(journalEntry.organizationId, ctx.organizationId));

      const entryNumber = (maxResult?.max || 0) + 1;

      const [entry] = await db
        .insert(journalEntry)
        .values({
          organizationId: ctx.organizationId,
          entryNumber,
          date: run.payPeriodEnd,
          description: `Payroll ${run.payPeriodStart} to ${run.payPeriodEnd}`,
          reference: `PR-${run.id.slice(0, 8)}`,
          status: "posted",
          sourceType: "payroll",
          sourceId: run.id,
          postedAt: new Date(),
          createdBy: ctx.userId,
        })
        .returning();

      journalEntryId = entry.id;

      const lines: (typeof journalLine.$inferInsert)[] = [];

      // DR Salary Expense for total gross
      lines.push({
        journalEntryId: entry.id,
        accountId: salaryAccount.id,
        description: `Payroll - Gross wages`,
        debitAmount: run.totalGross,
        creditAmount: 0,
      });

      // CR Tax Payable for total deductions (taxes)
      if (taxPayableAccount && run.totalDeductions > 0) {
        lines.push({
          journalEntryId: entry.id,
          accountId: taxPayableAccount.id,
          description: `Payroll - Tax withholding`,
          debitAmount: 0,
          creditAmount: run.totalDeductions,
        });
      }

      // CR Bank/Cash for net pay
      lines.push({
        journalEntryId: entry.id,
        accountId: bankAccount.id,
        description: `Payroll - Net wages paid`,
        debitAmount: 0,
        creditAmount: run.totalNet,
      });

      // If no tax account, CR bank for full gross
      if (!taxPayableAccount && run.totalDeductions > 0) {
        // Adjust: the bank credit should be totalGross to balance
        lines[lines.length - 1].creditAmount = run.totalGross;
      }

      await db.insert(journalLine).values(lines);
    }

    // Update payroll run
    const [updated] = await db
      .update(payrollRun)
      .set({
        status: "completed",
        journalEntryId,
        processedAt: new Date(),
      })
      .where(eq(payrollRun.id, id))
      .returning();

    return NextResponse.json({ run: { ...updated, items: run.items } });
  } catch (err) {
    return handleError(err);
  }
}
