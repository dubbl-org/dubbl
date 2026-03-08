import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  revenueSchedule,
  revenueEntry,
} from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { parsePagination, paginatedResponse } from "@/lib/api/pagination";
import { z } from "zod";

const createSchema = z.object({
  invoiceId: z.string().min(1),
  invoiceLineId: z.string().optional(),
  totalAmount: z.number().positive(),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  method: z
    .enum(["straight_line", "milestone", "on_completion"])
    .default("straight_line"),
});

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const url = new URL(request.url);
    const { page, limit, offset } = parsePagination(url);

    const conditions = [
      eq(revenueSchedule.organizationId, ctx.organizationId),
    ];

    const schedules = await db.query.revenueSchedule.findMany({
      where: and(...conditions),
      orderBy: desc(revenueSchedule.createdAt),
      limit,
      offset,
      with: { entries: true },
    });

    const [countResult] = await db
      .select({ count: db.$count(revenueSchedule) })
      .from(revenueSchedule)
      .where(and(...conditions));

    return NextResponse.json(
      paginatedResponse(schedules, Number(countResult?.count || 0), page, limit)
    );
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:revenue");

    const body = await request.json();
    const parsed = createSchema.parse(body);

    const totalAmountCents = Math.round(parsed.totalAmount * 100);

    // Calculate months between start and end for straight_line
    const start = new Date(parsed.startDate);
    const end = new Date(parsed.endDate);
    const months =
      (end.getFullYear() - start.getFullYear()) * 12 +
      (end.getMonth() - start.getMonth()) +
      1;

    const periods = Math.max(1, months);
    const perPeriod = Math.floor(totalAmountCents / periods);
    const remainder = totalAmountCents - perPeriod * (periods - 1);

    const [schedule] = await db
      .insert(revenueSchedule)
      .values({
        organizationId: ctx.organizationId,
        invoiceId: parsed.invoiceId,
        invoiceLineId: parsed.invoiceLineId || null,
        totalAmount: totalAmountCents,
        startDate: parsed.startDate,
        endDate: parsed.endDate,
        method: parsed.method,
        createdBy: ctx.userId,
      })
      .returning();

    // Generate entries
    const entries = [];
    for (let i = 0; i < periods; i++) {
      const periodDate = new Date(start);
      periodDate.setMonth(periodDate.getMonth() + i);
      const amount = i === periods - 1 ? remainder : perPeriod;
      entries.push({
        scheduleId: schedule.id,
        periodDate: periodDate.toISOString().split("T")[0],
        amount,
        sortOrder: i,
      });
    }

    await db.insert(revenueEntry).values(entries);

    const result = await db.query.revenueSchedule.findFirst({
      where: eq(revenueSchedule.id, schedule.id),
      with: { entries: true },
    });

    return NextResponse.json({ schedule: result }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
