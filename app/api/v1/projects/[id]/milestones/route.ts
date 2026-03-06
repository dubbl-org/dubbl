import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { project, projectMilestone } from "@/lib/db/schema";
import { eq, and, asc } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { z } from "zod";

const createSchema = z.object({
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  amount: z.number().int().min(0).default(0),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);

    const proj = await db.query.project.findFirst({
      where: and(
        eq(project.id, id),
        eq(project.organizationId, ctx.organizationId),
        notDeleted(project.deletedAt)
      ),
    });

    if (!proj) return notFound("Project");

    const milestones = await db.query.projectMilestone.findMany({
      where: eq(projectMilestone.projectId, id),
      orderBy: asc(projectMilestone.sortOrder),
    });

    return NextResponse.json({ milestones });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:projects");

    const body = await request.json();
    const parsed = createSchema.parse(body);

    const proj = await db.query.project.findFirst({
      where: and(
        eq(project.id, id),
        eq(project.organizationId, ctx.organizationId),
        notDeleted(project.deletedAt)
      ),
    });

    if (!proj) return notFound("Project");

    const [created] = await db
      .insert(projectMilestone)
      .values({
        projectId: id,
        title: parsed.title,
        description: parsed.description || null,
        dueDate: parsed.dueDate || null,
        amount: parsed.amount,
      })
      .returning();

    return NextResponse.json({ milestone: created }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
