import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { project } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { parsePagination, paginatedResponse } from "@/lib/api/pagination";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  contactId: z.string().nullable().optional(),
  status: z.enum(["active", "completed", "archived"]).default("active"),
  budget: z.number().int().min(0).default(0),
  hourlyRate: z.number().int().min(0).default(0),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
});

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const url = new URL(request.url);
    const { page, limit, offset } = parsePagination(url);
    const status = url.searchParams.get("status");

    const conditions = [
      eq(project.organizationId, ctx.organizationId),
      notDeleted(project.deletedAt),
    ];

    if (status) {
      conditions.push(eq(project.status, status as typeof project.status.enumValues[number]));
    }

    const projects = await db.query.project.findMany({
      where: and(...conditions),
      orderBy: desc(project.createdAt),
      limit,
      offset,
      with: { contact: true },
    });

    const [countResult] = await db
      .select({ count: db.$count(project) })
      .from(project)
      .where(and(...conditions));

    return NextResponse.json(
      paginatedResponse(projects, Number(countResult?.count || 0), page, limit)
    );
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:projects");

    const body = await request.json();
    const parsed = createSchema.parse(body);

    const [created] = await db
      .insert(project)
      .values({
        organizationId: ctx.organizationId,
        name: parsed.name,
        description: parsed.description || null,
        contactId: parsed.contactId || null,
        status: parsed.status,
        budget: parsed.budget,
        hourlyRate: parsed.hourlyRate,
        startDate: parsed.startDate || null,
        endDate: parsed.endDate || null,
      })
      .returning();

    return NextResponse.json({ project: created }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
