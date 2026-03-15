import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { budget, budgetLine, budgetPeriod } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { notDeleted, softDelete } from "@/lib/db/soft-delete";
import { generatePeriods, distributeAmount } from "@/lib/budget-periods";
import type { PeriodType } from "@/lib/budget-periods";
import { z } from "zod";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);

    const found = await db.query.budget.findFirst({
      where: and(
        eq(budget.id, id),
        eq(budget.organizationId, ctx.organizationId),
        notDeleted(budget.deletedAt)
      ),
      with: {
        fiscalYear: true,
        lines: {
          with: {
            account: true,
            periods: true,
          },
        },
      },
    });

    if (!found) return notFound("Budget");
    return NextResponse.json({ budget: found });
  } catch (err) {
    return handleError(err);
  }
}

const periodSchema = z.object({
  label: z.string().min(1),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  amount: z.number().int().default(0),
  sortOrder: z.number().int().default(0),
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  fiscalYearId: z.string().nullable().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  periodType: z.enum(["monthly", "weekly", "daily", "quarterly", "yearly", "custom"]).optional(),
  isActive: z.boolean().optional(),
  lines: z
    .array(
      z.object({
        id: z.string().optional(),
        accountId: z.string().min(1),
        total: z.number().int().optional(),
        periods: z.array(periodSchema).optional(),
      })
    )
    .optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:budgets");

    const existing = await db.query.budget.findFirst({
      where: and(
        eq(budget.id, id),
        eq(budget.organizationId, ctx.organizationId),
        notDeleted(budget.deletedAt)
      ),
    });

    if (!existing) return notFound("Budget");

    const body = await request.json();
    const parsed = updateSchema.parse(body);

    const { lines, ...budgetFields } = parsed;

    const [updated] = await db
      .update(budget)
      .set({ ...budgetFields, updatedAt: new Date() })
      .where(eq(budget.id, id))
      .returning();

    if (lines) {
      // Delete old lines (periods cascade)
      await db.delete(budgetLine).where(eq(budgetLine.budgetId, id));

      const periodType = (parsed.periodType || existing.periodType) as PeriodType;
      const startDate = parsed.startDate || existing.startDate;
      const endDate = parsed.endDate || existing.endDate;

      for (const line of lines) {
        let periods = line.periods;
        if (!periods || periods.length === 0) {
          const generated = generatePeriods(periodType, startDate, endDate);
          const total = line.total || 0;
          const amounts = distributeAmount(total, generated.length);
          periods = generated.map((p, i) => ({ ...p, amount: amounts[i] }));
        }

        const total = line.total ?? periods.reduce((s, p) => s + p.amount, 0);

        const [createdLine] = await db
          .insert(budgetLine)
          .values({
            budgetId: id,
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
    }

    return NextResponse.json({ budget: updated });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:budgets");

    const existing = await db.query.budget.findFirst({
      where: and(
        eq(budget.id, id),
        eq(budget.organizationId, ctx.organizationId),
        notDeleted(budget.deletedAt)
      ),
    });

    if (!existing) return notFound("Budget");

    await db.update(budget).set(softDelete()).where(eq(budget.id, id));

    logAudit({
      ctx,
      action: "delete",
      entityType: "budget",
      entityId: id,
      changes: existing as Record<string, unknown>,
      request,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
