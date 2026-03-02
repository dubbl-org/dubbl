import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { payrollEmployee } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { parsePagination, paginatedResponse } from "@/lib/api/pagination";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().nullable().optional(),
  employeeNumber: z.string().min(1),
  position: z.string().nullable().optional(),
  salary: z.number().int().min(0),
  payFrequency: z.enum(["weekly", "biweekly", "monthly"]).default("monthly"),
  taxRate: z.number().int().min(0).default(2000),
  bankAccountNumber: z.string().nullable().optional(),
  startDate: z.string().min(1),
  endDate: z.string().nullable().optional(),
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

    const employees = await db.query.payrollEmployee.findMany({
      where: and(...conditions),
      orderBy: desc(payrollEmployee.createdAt),
      limit,
      offset,
    });

    const [countResult] = await db
      .select({ count: db.$count(payrollEmployee) })
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

    const [created] = await db
      .insert(payrollEmployee)
      .values({
        organizationId: ctx.organizationId,
        name: parsed.name,
        email: parsed.email || null,
        employeeNumber: parsed.employeeNumber,
        position: parsed.position || null,
        salary: parsed.salary,
        payFrequency: parsed.payFrequency,
        taxRate: parsed.taxRate,
        bankAccountNumber: parsed.bankAccountNumber || null,
        startDate: parsed.startDate,
        endDate: parsed.endDate || null,
      })
      .returning();

    return NextResponse.json({ employee: created }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
