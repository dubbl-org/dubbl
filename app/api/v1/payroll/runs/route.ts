import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { payrollRun, payrollItem, payrollEmployee } from "@/lib/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { parsePagination, paginatedResponse } from "@/lib/api/pagination";
import { z } from "zod";

const createSchema = z.object({
  payPeriodStart: z.string().min(1),
  payPeriodEnd: z.string().min(1),
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
    }> = [];

    for (const emp of employees) {
      let grossAmount = 0;
      let itemType: PayrollItemType = "regular_salary";
      let description: string | null = null;

      switch (emp.compensationType) {
        case "hourly": {
          // For hourly employees, we need time entries for the period
          // Calculate from time entries if available, otherwise skip
          if (!emp.hourlyRate) continue;
          // Default to standard hours if no time tracking
          const hoursPerPeriod = emp.payFrequency === "weekly" ? 40 : emp.payFrequency === "biweekly" ? 80 : 173;
          grossAmount = Math.round((emp.hourlyRate * hoursPerPeriod));
          itemType = "hourly_pay";
          description = `${hoursPerPeriod}h @ ${(emp.hourlyRate / 100).toFixed(2)}/hr`;
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

      const taxAmount = Math.round((grossAmount * emp.taxRate) / 10000);
      const deductions = taxAmount;
      const netAmount = grossAmount - deductions;

      totalGross += grossAmount;
      totalDeductions += deductions;
      totalNet += netAmount;

      items.push({
        employeeId: emp.id,
        type: itemType,
        description,
        grossAmount,
        taxAmount,
        deductions,
        netAmount,
        projectId: null,
        milestoneId: null,
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
