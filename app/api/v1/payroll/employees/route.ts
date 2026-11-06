import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { payrollEmployee } from "@/lib/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { parsePagination, paginatedResponse } from "@/lib/api/pagination";
import { z } from "zod";
import { currencyCodeSchema } from "@/lib/currency/zod";
import { checkEmployeeLimit } from "@/lib/api/check-limit";
import { resolvePayrollSettings } from "@/lib/api/payroll-withholding";
import { syncLeaveBalances } from "@/lib/api/leave-balances";

const createSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().nullable().optional(),
  employeeNumber: z.string().min(1),
  position: z.string().nullable().optional(),
  department: z.string().trim().nullable().optional(),
  salary: z.number().int().min(0),
  payFrequency: z.enum(["weekly", "biweekly", "monthly"]).default("monthly"),
  // Defaults to the "Default Tax Rate" in payroll settings.
  taxRate: z.number().int().min(0).max(10000).optional(),
  bankAccountNumber: z.string().nullable().optional(),
  startDate: z.string().min(1),
  endDate: z.string().nullable().optional(),
  memberId: z.string().uuid().nullable().optional(),
  compensationType: z.enum(["salary", "hourly", "milestone", "commission"]).default("salary"),
  hourlyRate: z.number().int().min(0).nullable().optional(),
  currency: currencyCodeSchema.default("USD"),
});

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:payroll");

    const url = new URL(request.url);
    const { page, limit, offset } = parsePagination(url);
    const active = url.searchParams.get("active");

    const conditions = [
      eq(payrollEmployee.organizationId, ctx.organizationId),
      notDeleted(payrollEmployee.deletedAt),
    ];

    if (active === "true") {
      conditions.push(eq(payrollEmployee.isActive, true));
    } else if (active === "false") {
      conditions.push(eq(payrollEmployee.isActive, false));
    }

    // Keep "Time off left" current (leave accrues over time).
    await syncLeaveBalances(ctx.organizationId);

    const employees = await db.query.payrollEmployee.findMany({
      where: and(...conditions),
      orderBy: desc(payrollEmployee.createdAt),
      // Lists never carry bank numbers; open an employee to see theirs
      columns: { bankAccountNumber: false },
      with: { member: { with: { user: { columns: { id: true, name: true, email: true, image: true } } } } },
      limit,
      offset,
    });

    const [countResult] = await db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(payrollEmployee)
      .where(and(...conditions));

    return NextResponse.json(
      paginatedResponse(
        employees,
        Number(countResult?.count || 0),
        page,
        limit
      )
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
    await checkEmployeeLimit(ctx.organizationId);
    const settings = await resolvePayrollSettings(ctx.organizationId);

    const [created] = await db
      .insert(payrollEmployee)
      .values({
        organizationId: ctx.organizationId,
        name: parsed.name,
        email: parsed.email || null,
        employeeNumber: parsed.employeeNumber,
        position: parsed.position || null,
        department: parsed.department || null,
        salary: parsed.salary,
        payFrequency: parsed.payFrequency,
        taxRate: parsed.taxRate ?? settings.defaultTaxRate,
        bankAccountNumber: parsed.bankAccountNumber || null,
        startDate: parsed.startDate,
        endDate: parsed.endDate || null,
        memberId: parsed.memberId || null,
        compensationType: parsed.compensationType,
        hourlyRate: parsed.hourlyRate ?? null,
        currency: parsed.currency,
      })
      .returning();

    return NextResponse.json({ employee: created }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
