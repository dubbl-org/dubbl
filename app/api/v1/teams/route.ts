import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { team } from "@/lib/db/schema";
import { eq, and, desc, sql, ilike } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { parsePagination, paginatedResponse } from "@/lib/api/pagination";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  color: z.string().optional().default("#3b82f6"),
});

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const url = new URL(request.url);
    const { page, limit, offset } = parsePagination(url);
    const search = url.searchParams.get("search");

    const conditions = [
      eq(team.organizationId, ctx.organizationId),
    ];

    if (search) {
      conditions.push(ilike(team.name, `%${search}%`));
    }

    const teams = await db.query.team.findMany({
      where: and(...conditions),
      orderBy: desc(team.createdAt),
      limit,
      offset,
      with: { members: true },
    });

    const [countResult] = await db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(team)
      .where(and(...conditions));

    return NextResponse.json(
      paginatedResponse(teams, Number(countResult?.count || 0), page, limit)
    );
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:teams");

    const body = await request.json();
    const parsed = createSchema.parse(body);

    const [created] = await db
      .insert(team)
      .values({
        organizationId: ctx.organizationId,
        name: parsed.name,
        description: parsed.description || null,
        color: parsed.color,
      })
      .returning();

    return NextResponse.json({ team: created }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
