import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { revenueSchedule } from "@/lib/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { error, handleError } from "@/lib/api/response";
import { parsePagination, paginatedResponse } from "@/lib/api/pagination";
import { createRevenueSchedule, RevenueScheduleError } from "@/lib/api/revenue-schedules";
import { z } from "zod";

const createSchema = z.object({
  invoiceId: z.string().uuid(),
  invoiceLineId: z.string().uuid().optional().nullable(),
  // Integer cents in the invoice's currency (e.g. 120000 = 1,200.00).
  totalAmount: z.number().int().positive(),
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

    const rows = await db.query.revenueSchedule.findMany({
      where: and(...conditions),
      orderBy: desc(revenueSchedule.createdAt),
      limit,
      offset,
      with: {
        entries: true,
        invoice: { columns: { invoiceNumber: true, currencyCode: true }, with: { contact: { columns: { name: true } } } },
      },
    });
    const schedules = rows.map(({ invoice: inv, ...s }) => ({
      ...s,
      invoiceNumber: inv?.invoiceNumber ?? null,
      currencyCode: inv?.currencyCode ?? null,
      contactName: inv?.contact?.name ?? null,
    }));

    const [countResult] = await db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(revenueSchedule)
      .where(and(...conditions));

    return NextResponse.json(
      paginatedResponse(schedules, Number(countResult?.count || 0), page, limit)
    );
  } catch (err) {
    return handleError(err);
  }
}

/**
 * Create a schedule for a sent invoice. Moves totalAmount (integer cents) of
 * the invoice's income into deferred revenue and generates the periods that
 * count it back. Pass invoiceLineId when the invoice's lines use different
 * income accounts.
 */
export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:revenue");

    const body = await request.json();
    const parsed = createSchema.parse(body);

    const schedule = await createRevenueSchedule(
      { organizationId: ctx.organizationId, userId: ctx.userId, auth: ctx },
      parsed
    );

    return NextResponse.json({ schedule }, { status: 201 });
  } catch (err) {
    if (err instanceof RevenueScheduleError) return error(err.message, err.status);
    return handleError(err);
  }
}
