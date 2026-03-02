import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { budget, budgetLine } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { notDeleted, softDelete } from "@/lib/db/soft-delete";
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
          with: { account: true },
        },
      },
    });

    if (!found) return notFound("Budget");
    return NextResponse.json({ budget: found });
  } catch (err) {
    return handleError(err);
  }
}

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  fiscalYearId: z.string().nullable().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  isActive: z.boolean().optional(),
  lines: z
    .array(
      z.object({
        id: z.string().optional(),
        accountId: z.string().min(1),
        jan: z.number().int().default(0),
        feb: z.number().int().default(0),
        mar: z.number().int().default(0),
        apr: z.number().int().default(0),
        may: z.number().int().default(0),
        jun: z.number().int().default(0),
        jul: z.number().int().default(0),
        aug: z.number().int().default(0),
        sep: z.number().int().default(0),
        oct: z.number().int().default(0),
        nov: z.number().int().default(0),
        dec: z.number().int().default(0),
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

    // If lines are provided, replace them
    if (lines) {
      await db.delete(budgetLine).where(eq(budgetLine.budgetId, id));
      const processedLines = lines.map((l) => {
        const total = l.jan + l.feb + l.mar + l.apr + l.may + l.jun +
          l.jul + l.aug + l.sep + l.oct + l.nov + l.dec;
        return {
          budgetId: id,
          accountId: l.accountId,
          jan: l.jan,
          feb: l.feb,
          mar: l.mar,
          apr: l.apr,
          may: l.may,
          jun: l.jun,
          jul: l.jul,
          aug: l.aug,
          sep: l.sep,
          oct: l.oct,
          nov: l.nov,
          dec: l.dec,
          total,
        };
      });
      if (processedLines.length > 0) {
        await db.insert(budgetLine).values(processedLines);
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

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
