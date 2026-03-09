import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { project, projectMilestone, milestoneAssignment } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound, validationError } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { z } from "zod";

const createSchema = z
  .object({
    amount: z.number().int(),
    description: z.string().optional(),
    employeeId: z.string().uuid().optional(),
    memberId: z.string().uuid().optional(),
  })
  .refine((data) => data.employeeId || data.memberId, {
    message: "At least one of employeeId or memberId is required",
  });

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; milestoneId: string }> }
) {
  try {
    const { id, milestoneId } = await params;
    const ctx = await getAuthContext(request);

    const proj = await db.query.project.findFirst({
      where: and(
        eq(project.id, id),
        eq(project.organizationId, ctx.organizationId),
        notDeleted(project.deletedAt)
      ),
    });

    if (!proj) return notFound("Project");

    const milestone = await db.query.projectMilestone.findFirst({
      where: and(
        eq(projectMilestone.id, milestoneId),
        eq(projectMilestone.projectId, id)
      ),
    });

    if (!milestone) return notFound("Milestone");

    const assignments = await db.query.milestoneAssignment.findMany({
      where: eq(milestoneAssignment.milestoneId, milestoneId),
      with: {
        employee: true,
        member: { with: { user: true } },
      },
    });

    return NextResponse.json({ assignments });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; milestoneId: string }> }
) {
  try {
    const { id, milestoneId } = await params;
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

    const milestone = await db.query.projectMilestone.findFirst({
      where: and(
        eq(projectMilestone.id, milestoneId),
        eq(projectMilestone.projectId, id)
      ),
    });

    if (!milestone) return notFound("Milestone");

    const [created] = await db
      .insert(milestoneAssignment)
      .values({
        milestoneId,
        amount: parsed.amount,
        description: parsed.description || null,
        employeeId: parsed.employeeId || null,
        memberId: parsed.memberId || null,
      })
      .returning();

    return NextResponse.json({ assignment: created }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; milestoneId: string }> }
) {
  try {
    const { id, milestoneId } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:projects");

    const url = new URL(request.url);
    const assignmentId = url.searchParams.get("assignmentId");
    if (!assignmentId) return validationError("assignmentId is required");

    const proj = await db.query.project.findFirst({
      where: and(
        eq(project.id, id),
        eq(project.organizationId, ctx.organizationId),
        notDeleted(project.deletedAt)
      ),
    });

    if (!proj) return notFound("Project");

    const [updated] = await db
      .update(milestoneAssignment)
      .set({ isPaid: true })
      .where(
        and(
          eq(milestoneAssignment.id, assignmentId),
          eq(milestoneAssignment.milestoneId, milestoneId)
        )
      )
      .returning();

    if (!updated) return notFound("Assignment");

    return NextResponse.json({ assignment: updated });
  } catch (err) {
    return handleError(err);
  }
}
