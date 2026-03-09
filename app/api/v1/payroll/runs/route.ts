import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  payrollRun,
  payrollItem,
  payrollEmployee,
  payrollSettings,
  employeeDeduction,
  deductionType,
  timesheet,
  timesheetEntry,
} from "@/lib/db/schema";
import { eq, and, desc, sql, gte, lte } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { parsePagination, paginatedResponse } from "@/lib/api/pagination";
import { z } from "zod";

const createSchema = z.object({
  payPeriodStart: z.string().min(1),
  payPeriodEnd: z.string().min(1),
  runType: z.string().optional(),
});

/**
 * Calculate gross pay for one pay period based on annual salary and frequency.
 */
function calculateGrossPay(
  annualSalary: number,
  payFrequency: string
): number {
  switch (payFrequency) {
    case "weekly":
      return Math.round(annualSalary / 52);
    case "biweekly":
      return Math.round(annualSalary / 26);
    case "monthly":
    default:
      return Math.round(annualSalary / 12);
  }
}

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:payroll");

    const url = new URL(request.url);
    const { page, limit, offset } = parsePagination(url);
    const status = url.searchParams.get("status");

    const conditions = [
      eq(payrollRun.organizationId, ctx.organizationId),
      notDeleted(payrollRun.deletedAt),
    ];

    if (status) {
      conditions.push(
        eq(
          payrollRun.status,
          status as (typeof payrollRun.status.enumValues)[number]
        )
      );
    }

    const runs = await db.query.payrollRun.findMany({
      where: and(...conditions),
      orderBy: desc(payrollRun.createdAt),
      with: { items: { with: { employee: true } } },
      limit,
      offset,
    });

    const [countResult] = await db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(payrollRun)
      .where(and(...conditions));

    return NextResponse.json(
      paginatedResponse(runs, Number(countResult?.count || 0), page, limit)
    );
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:payroll");

    const body = await request.json();
    const parsed = createSchema.parse(body);

    // Get all active employees
    const employees = await db.query.payrollEmployee.findMany({
      where: and(
        eq(payrollEmployee.organizationId, ctx.organizationId),
        eq(payrollEmployee.isActive, true),
        notDeleted(payrollEmployee.deletedAt)
      ),
    });

    if (employees.length === 0) {
      return NextResponse.json(
        { error: "No active employees found" },
        { status: 400 }
      );
    }

    // Fetch org payroll settings for OT rules
    const settings = await db.query.payrollSettings.findFirst({
      where: eq(payrollSettings.organizationId, ctx.organizationId),
    });

    const overtimeThreshold = settings?.overtimeThresholdHours ?? 40;
    const overtimeMultiplier = settings?.overtimeMultiplier ?? 1.5;

    // Create the payroll run
    let totalGross = 0;
    let totalDeductions = 0;
    let totalNet = 0;

    type PayrollItemType = "regular_salary" | "hourly_pay" | "overtime" | "milestone_bonus" | "project_bonus" | "commission" | "deduction" | "reimbursement";
    const items: Array<{
      employeeId: string;
      type: PayrollItemType;
      description: string | null;
      grossAmount: number;
      taxAmount: number;
      deductions: number;
      netAmount: number;
      projectId: string | null;
      milestoneId: string | null;
      overtimeHours: number | null;
      overtimeAmount: number | null;
      preTaxDeductions: number;
      postTaxDeductions: number;
      timesheetId: string | null;
    }> = [];

    for (const emp of employees) {
      let grossAmount = 0;
      let itemType: PayrollItemType = "regular_salary";
      let description: string | null = null;
      let otHours: number | null = null;
      let otAmount: number | null = null;
      let linkedTimesheetId: string | null = null;

      switch (emp.compensationType) {
        case "hourly": {
          if (!emp.hourlyRate) continue;

          // Try to pull hours from approved timesheets for the pay period
          const approvedTimesheets = await db.query.timesheet.findMany({
            where: and(
              eq(timesheet.employeeId, emp.id),
              eq(timesheet.status, "approved"),
              lte(timesheet.periodStart, parsed.payPeriodEnd),
              gte(timesheet.periodEnd, parsed.payPeriodStart)
            ),
            with: { entries: true },
          });

          let totalHours = 0;

          if (approvedTimesheets.length > 0) {
            // Sum hours from timesheet entries
            for (const ts of approvedTimesheets) {
              for (const entry of ts.entries) {
                totalHours += entry.hours;
              }
            }
            // Link the first timesheet for reference
            linkedTimesheetId = approvedTimesheets[0].id;
          } else {
            // Default to standard hours if no approved timesheets
            totalHours = emp.payFrequency === "weekly" ? 40 : emp.payFrequency === "biweekly" ? 80 : 173;
          }

          // Apply overtime rules
          let regularHours = totalHours;
          let overtimeHrs = 0;

          if (totalHours > overtimeThreshold) {
            regularHours = overtimeThreshold;
            overtimeHrs = totalHours - overtimeThreshold;
          }

          const regularAmount = Math.round(emp.hourlyRate * regularHours);
          const overtimeAmt = Math.round(emp.hourlyRate * overtimeMultiplier * overtimeHrs);
          grossAmount = regularAmount + overtimeAmt;

          if (overtimeHrs > 0) {
            otHours = overtimeHrs;
            otAmount = overtimeAmt;
            description = `${regularHours}h @ ${(emp.hourlyRate / 100).toFixed(2)}/hr + ${overtimeHrs}h OT @ ${((emp.hourlyRate * overtimeMultiplier) / 100).toFixed(2)}/hr`;
          } else {
            description = `${totalHours}h @ ${(emp.hourlyRate / 100).toFixed(2)}/hr`;
          }

          itemType = "hourly_pay";
          break;
        }
        case "milestone":
        case "commission":
          // Milestone and commission employees get paid when milestones/commissions are recorded
          // Skip automatic payroll generation for these types
          continue;
        case "salary":
        default: {
          grossAmount = calculateGrossPay(emp.salary, emp.payFrequency);
          itemType = "regular_salary";
          break;
        }
      }

      // Fetch active employee deductions with their deduction type
      const empDeductions = await db.query.employeeDeduction.findMany({
        where: and(
          eq(employeeDeduction.employeeId, emp.id),
          eq(employeeDeduction.isActive, true),
          notDeleted(employeeDeduction.deletedAt)
        ),
        with: { deductionType: true },
      });

      let preTaxDeductionTotal = 0;
      let postTaxDeductionTotal = 0;

      for (const ded of empDeductions) {
        // Skip inactive deduction types
        if (!ded.deductionType?.isActive) continue;

        // Calculate deduction amount: use employee override, then deduction type defaults
        let dedAmount = 0;
        if (ded.amount != null) {
          dedAmount = ded.amount;
        } else if (ded.percent != null) {
          dedAmount = Math.round((grossAmount * ded.percent) / 100);
        } else if (ded.deductionType.defaultAmount != null) {
          dedAmount = ded.deductionType.defaultAmount;
        } else if (ded.deductionType.defaultPercent != null) {
          dedAmount = Math.round((grossAmount * ded.deductionType.defaultPercent) / 100);
        }

        if (dedAmount <= 0) continue;

        if (ded.deductionType.category === "pre_tax") {
          preTaxDeductionTotal += dedAmount;
        } else {
          postTaxDeductionTotal += dedAmount;
        }
      }

      // Pre-tax deductions reduce taxable income
      const taxableIncome = Math.max(0, grossAmount - preTaxDeductionTotal);
      const taxAmount = Math.round((taxableIncome * emp.taxRate) / 10000);

      // Total deductions = tax + pre-tax + post-tax
      const totalItemDeductions = taxAmount + preTaxDeductionTotal + postTaxDeductionTotal;
      const netAmount = grossAmount - totalItemDeductions;

      totalGross += grossAmount;
      totalDeductions += totalItemDeductions;
      totalNet += netAmount;

      items.push({
        employeeId: emp.id,
        type: itemType,
        description,
        grossAmount,
        taxAmount,
        deductions: totalItemDeductions,
        netAmount,
        projectId: null,
        milestoneId: null,
        overtimeHours: otHours,
        overtimeAmount: otAmount,
        preTaxDeductions: preTaxDeductionTotal,
        postTaxDeductions: postTaxDeductionTotal,
        timesheetId: linkedTimesheetId,
      });
    }

    if (items.length === 0) {
      return NextResponse.json(
        { error: "No payable employees found for this period" },
        { status: 400 }
      );
    }

    const [run] = await db
      .insert(payrollRun)
      .values({
        organizationId: ctx.organizationId,
        payPeriodStart: parsed.payPeriodStart,
        payPeriodEnd: parsed.payPeriodEnd,
        runType: (parsed.runType as typeof payrollRun.runType.enumValues[number]) ?? "regular",
        totalGross,
        totalDeductions,
        totalNet,
      })
      .returning();

    // Insert payroll items
    await db.insert(payrollItem).values(
      items.map((item) => ({
        payrollRunId: run.id,
        ...item,
      }))
    );


    return NextResponse.json({ run }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
