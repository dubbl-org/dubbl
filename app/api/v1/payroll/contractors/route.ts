import { db } from "@/lib/db";
import { contractor } from "@/lib/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, ok, created } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { parsePagination, paginatedResponse } from "@/lib/api/pagination";
import { logAudit } from "@/lib/api/audit";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional(),
  company: z.string().optional(),
  taxId: z.string().optional(),
  hourlyRate: z.number().int().optional(),
  currency: z.string().max(3).optional(),
  bankAccountNumber: z.string().optional(),
});

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:contractors");

    const url = new URL(request.url);
    const { page, limit, offset } = parsePagination(url);

    const conditions = [
      eq(contractor.organizationId, ctx.organizationId),
      notDeleted(contractor.deletedAt),
    ];

    const contractors = await db.query.contractor.findMany({
      where: and(...conditions),
      orderBy: desc(contractor.createdAt),
      limit,
      offset,
    });

    const [countResult] = await db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(contractor)
      .where(and(...conditions));

    return ok(paginatedResponse(contractors, Number(countResult?.count || 0), page, limit));
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:contractors");

    const body = await request.json();
    const parsed = createSchema.parse(body);

    const [c] = await db
      .insert(contractor)
      .values({ organizationId: ctx.organizationId, ...parsed })
      .returning();

    logAudit({ ctx, action: "create", entityType: "contractor", entityId: c.id, request });

    return created({ contractor: c });
  } catch (err) {
    return handleError(err);
  }
}
