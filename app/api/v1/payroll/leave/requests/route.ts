import { db } from "@/lib/db";
import { leaveRequest } from "@/lib/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, ok, created } from "@/lib/api/response";
import { parsePagination, paginatedResponse } from "@/lib/api/pagination";
import { logAudit } from "@/lib/api/audit";
import { z } from "zod";

const createSchema = z.object({
  employeeId: z.string().uuid(),
  policyId: z.string().uuid(),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  hours: z.number().min(0),
  reason: z.string().optional(),
});

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:leave");

    const url = new URL(request.url);
    const { page, limit, offset } = parsePagination(url);
    const status = url.searchParams.get("status");

    const conditions = [eq(leaveRequest.organizationId, ctx.organizationId)];
    if (status) {
      conditions.push(eq(leaveRequest.status, status as "approved" | "rejected" | "pending" | "cancelled"));
    }

    const requests = await db.query.leaveRequest.findMany({
      where: and(...conditions),
      orderBy: desc(leaveRequest.createdAt),
      with: { employee: true, policy: true },
      limit,
      offset,
    });

    const [countResult] = await db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(leaveRequest)
      .where(and(...conditions));

    return ok(paginatedResponse(requests, Number(countResult?.count || 0), page, limit));
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:leave");

    const body = await request.json();
    const parsed = createSchema.parse(body);

    const [req] = await db
      .insert(leaveRequest)
      .values({ organizationId: ctx.organizationId, ...parsed })
      .returning();

    logAudit({ ctx, action: "create", entityType: "leaveRequest", entityId: req.id, request });

    return created({ request: req });
  } catch (err) {
    return handleError(err);
  }
}
