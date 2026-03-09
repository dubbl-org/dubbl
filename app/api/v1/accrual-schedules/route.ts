import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  accrualSchedule,
  accrualEntry,
  journalEntry,
} from "@/lib/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { parsePagination, paginatedResponse } from "@/lib/api/pagination";
import { z } from "zod";

const createSchema = z.object({
  sourceEntryId: z.string().optional(),
  totalAmount: z.number().positive(),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  periods: z.number().int().positive(),
  accountId: z.string().min(1),
  reverseAccountId: z.string().min(1),
  description: z.string().min(1),
});

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const url = new URL(request.url);
    const { page, limit, offset } = parsePagination(url);

    const conditions = [
      eq(accrualSchedule.organizationId, ctx.organizationId),
    ];

    const schedules = await db.query.accrualSchedule.findMany({
      where: and(...conditions),
      orderBy: desc(accrualSchedule.createdAt),
      limit,
      offset,
      with: { entries: true },
    });

    const [countResult] = await db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(accrualSchedule)
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
    requireRole(ctx, "manage:accruals");

    const body = await request.json();
    const parsed = createSchema.parse(body);

    const totalAmountCents = Math.round(parsed.totalAmount * 100);
    const perPeriod = Math.floor(totalAmountCents / parsed.periods);
    const remainder = totalAmountCents - perPeriod * (parsed.periods - 1);

    const [schedule] = await db
      .insert(accrualSchedule)
      .values({
        organizationId: ctx.organizationId,
        sourceEntryId: parsed.sourceEntryId || null,
        totalAmount: totalAmountCents,
        startDate: parsed.startDate,
        endDate: parsed.endDate,
        periods: parsed.periods,
        accountId: parsed.accountId,
        reverseAccountId: parsed.reverseAccountId,
        description: parsed.description,
        createdBy: ctx.userId,
      })
      .returning();

    // Generate period entries
    const entries = [];
    const start = new Date(parsed.startDate);
    for (let i = 0; i < parsed.periods; i++) {
      const periodDate = new Date(start);
      periodDate.setMonth(periodDate.getMonth() + i);
      const amount = i === parsed.periods - 1 ? remainder : perPeriod;
      entries.push({
        scheduleId: schedule.id,
        periodDate: periodDate.toISOString().split("T")[0],
        amount,
        sortOrder: i,
      });
    }

    await db.insert(accrualEntry).values(entries);

    const result = await db.query.accrualSchedule.findFirst({
      where: eq(accrualSchedule.id, schedule.id),
      with: { entries: true },
    });

    return NextResponse.json({ schedule: result }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
