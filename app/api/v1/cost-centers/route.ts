import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { costCenter } from "@/lib/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { notDeleted } from "@/lib/db/soft-delete";
import { parsePagination, paginatedResponse } from "@/lib/api/pagination";
import { z } from "zod";

const createSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  parentId: z.string().nullable().optional(),
});

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const url = new URL(request.url);
    const { page, limit, offset } = parsePagination(url);

    const conditions = [
      eq(costCenter.organizationId, ctx.organizationId),
      notDeleted(costCenter.deletedAt),
    ];

    const centers = await db.query.costCenter.findMany({
      where: and(...conditions),
      orderBy: desc(costCenter.createdAt),
      limit,
      offset,
      with: { parent: true },
    });

    const [countResult] = await db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(costCenter)
      .where(and(...conditions));

    return NextResponse.json(
      paginatedResponse(centers, Number(countResult?.count || 0), page, limit)
    );
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:cost-centers");

    const body = await request.json();
    const parsed = createSchema.parse(body);

    const [created] = await db
      .insert(costCenter)
      .values({
        organizationId: ctx.organizationId,
        code: parsed.code,
        name: parsed.name,
        parentId: parsed.parentId || null,
      })
      .returning();

    logAudit({ ctx, action: "create", entityType: "cost_center", entityId: created.id, request });

    return NextResponse.json({ costCenter: created }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
