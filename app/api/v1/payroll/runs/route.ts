import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { payrollRun } from "@/lib/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, validationError } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { parsePagination, paginatedResponse } from "@/lib/api/pagination";
import { logAudit } from "@/lib/api/audit";
import {
  buildRegularRunItems,
  insertPayItems,
  sumRunTotals,
} from "@/lib/api/payroll-run-builder";
import { z } from "zod";

const createSchema = z.object({
  payPeriodStart: z.string().min(1),
  payPeriodEnd: z.string().min(1),
  runType: z.enum(["regular", "off_cycle"]).optional(),
});

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
    if (parsed.payPeriodEnd < parsed.payPeriodStart) {
      return validationError("The pay period end must be on or after its start");
    }

    // Gross pay (salary, approved timesheet hours with weekly overtime and
    // shift premiums, less unpaid leave), each employee's deductions, and the
    // progressive income tax + FICA withholding: see payroll-run-builder.
    const { items, employeeCount } = await buildRegularRunItems(
      ctx.organizationId,
      parsed.payPeriodStart,
      parsed.payPeriodEnd
    );

    if (employeeCount === 0) {
      return NextResponse.json(
        { error: "No active employees found" },
        { status: 400 }
      );
    }
    if (items.length === 0) {
      return NextResponse.json(
        { error: "No payable employees found for this period" },
        { status: 400 }
      );
    }

    const totals = sumRunTotals(items.map((i) => ({
      grossAmount: i.columns.grossAmount,
      deductions: i.columns.deductions ?? 0,
      netAmount: i.columns.netAmount,
      fxRate: i.columns.fxRate,
    })));

    // Persist the run, its items, and the per-item tax / deduction breakdowns
    // atomically so a payslip / W-2 / journal always sees a consistent split.
    const run = await db.transaction(async (tx) => {
      const [createdRun] = await tx
        .insert(payrollRun)
        .values({
          organizationId: ctx.organizationId,
          payPeriodStart: parsed.payPeriodStart,
          payPeriodEnd: parsed.payPeriodEnd,
          runType: parsed.runType ?? "regular",
          ...totals,
        })
        .returning();

      await insertPayItems(tx, createdRun.id, items);
      return createdRun;
    });

    logAudit({ ctx, action: "create", entityType: "payroll_run", entityId: run.id, changes: { ...totals, itemCount: items.length }, request });

    return NextResponse.json({ run }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
