import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { budget, budgetLine } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { parsePagination, paginatedResponse } from "@/lib/api/pagination";
import { z } from "zod";

const lineSchema = z.object({
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
});

const createSchema = z.object({
  name: z.string().min(1),
  fiscalYearId: z.string().nullable().optional(),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
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
      .select({ count: db.$count(budget) })
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

    const processedLines = parsed.lines.map((l) => {
      const total = l.jan + l.feb + l.mar + l.apr + l.may + l.jun +
        l.jul + l.aug + l.sep + l.oct + l.nov + l.dec;
      return { ...l, total };
    });

    const [created] = await db
      .insert(budget)
      .values({
        organizationId: ctx.organizationId,
        name: parsed.name,
        fiscalYearId: parsed.fiscalYearId || null,
        startDate: parsed.startDate,
        endDate: parsed.endDate,
        isActive: parsed.isActive,
      })
      .returning();

    await db.insert(budgetLine).values(
      processedLines.map((l) => ({
        budgetId: created.id,
        ...l,
      }))
    );

    return NextResponse.json({ budget: created }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
