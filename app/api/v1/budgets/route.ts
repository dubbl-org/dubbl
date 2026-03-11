import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { budget, budgetLine, budgetPeriod } from "@/lib/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { parsePagination, paginatedResponse } from "@/lib/api/pagination";
import { generatePeriods, distributeAmount } from "@/lib/budget-periods";
import type { PeriodType } from "@/lib/budget-periods";
import { z } from "zod";

const periodSchema = z.object({
  label: z.string().min(1),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  amount: z.number().int().default(0),
  sortOrder: z.number().int().default(0),
});

const lineSchema = z.object({
  accountId: z.string().min(1),
  total: z.number().int().optional(),
  periods: z.array(periodSchema).optional(),
});

const createSchema = z.object({
  name: z.string().min(1),
  fiscalYearId: z.string().nullable().optional(),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  periodType: z.enum(["monthly", "weekly", "daily", "quarterly", "yearly", "custom"]).default("monthly"),
  isActive: z.boolean().default(true),
  lines: z.array(lineSchema).min(1),
});

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const url = new URL(request.url);
    const { page, limit, offset } = parsePagination(url);

    const conditions = [
      eq(budget.organizationId, ctx.organizationId),
      notDeleted(budget.deletedAt),
    ];

    const budgets = await db.query.budget.findMany({
      where: and(...conditions),
      orderBy: desc(budget.createdAt),
      limit,
      offset,
      with: { fiscalYear: true },
    });

    const [countResult] = await db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(budget)
      .where(and(...conditions));

    return NextResponse.json(
      paginatedResponse(budgets, Number(countResult?.count || 0), page, limit)
    );
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:budgets");

    const body = await request.json();
    const parsed = createSchema.parse(body);

    const [created] = await db
      .insert(budget)
      .values({
        organizationId: ctx.organizationId,
        name: parsed.name,
        fiscalYearId: parsed.fiscalYearId || null,
        startDate: parsed.startDate,
        endDate: parsed.endDate,
        periodType: parsed.periodType,
        isActive: parsed.isActive,
      })
      .returning();

    for (const line of parsed.lines) {
      let periods = line.periods;
      if (!periods || periods.length === 0) {
        const generated = generatePeriods(parsed.periodType as PeriodType, parsed.startDate, parsed.endDate);
        const total = line.total || 0;
        const amounts = distributeAmount(total, generated.length);
        periods = generated.map((p, i) => ({ ...p, amount: amounts[i] }));
      }

      const total = line.total ?? periods.reduce((s, p) => s + p.amount, 0);

      const [createdLine] = await db
        .insert(budgetLine)
        .values({
          budgetId: created.id,
          accountId: line.accountId,
          total,
        })
        .returning();

      if (periods.length > 0) {
        await db.insert(budgetPeriod).values(
          periods.map((p) => ({
            budgetLineId: createdLine.id,
            label: p.label,
            startDate: p.startDate,
            endDate: p.endDate,
            amount: p.amount,
            sortOrder: p.sortOrder,
          }))
        );
      }
    }

    return NextResponse.json({ budget: created }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
