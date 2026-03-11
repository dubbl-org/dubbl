import { db } from "@/lib/db";
import { timesheet, payrollEmployee } from "@/lib/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, ok, created } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { parsePagination, paginatedResponse } from "@/lib/api/pagination";
import { logAudit } from "@/lib/api/audit";
import { z } from "zod";

const createSchema = z.object({
  employeeId: z.string().uuid(),
  periodStart: z.string().min(1),
  periodEnd: z.string().min(1),
});

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:timesheets");

    const url = new URL(request.url);
    const { page, limit, offset } = parsePagination(url);
    const status = url.searchParams.get("status");

    const conditions = [
      eq(timesheet.organizationId, ctx.organizationId),
      notDeleted(timesheet.deletedAt),
    ];

    if (status) {
      conditions.push(eq(timesheet.status, status as string));
    }

    const timesheets = await db.query.timesheet.findMany({
      where: and(...conditions),
      orderBy: desc(timesheet.createdAt),
      with: { employee: true },
      limit,
      offset,
    });

    const [countResult] = await db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(timesheet)
      .where(and(...conditions));

    return ok(paginatedResponse(timesheets, Number(countResult?.count || 0), page, limit));
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:timesheets");

    const body = await request.json();
    const parsed = createSchema.parse(body);

    const [ts] = await db
      .insert(timesheet)
      .values({ organizationId: ctx.organizationId, ...parsed })
      .returning();

    logAudit({ ctx, action: "create", entityType: "timesheet", entityId: ts.id, request });

    return created({ timesheet: ts });
  } catch (err) {
    return handleError(err);
  }
}
