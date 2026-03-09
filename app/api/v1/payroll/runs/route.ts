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

    const items = employees.map((emp) => {
      const grossAmount = calculateGrossPay(emp.salary, emp.payFrequency);
      // Tax amount: taxRate is in basis points (2000 = 20.00%)
      const taxAmount = Math.round((grossAmount * emp.taxRate) / 10000);
      const deductions = taxAmount;
      const netAmount = grossAmount - deductions;

      totalGross += grossAmount;
      totalDeductions += deductions;
      totalNet += netAmount;

      return {
        employeeId: emp.id,
        grossAmount,
        taxAmount,
        deductions,
        netAmount,
      };
    });

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
