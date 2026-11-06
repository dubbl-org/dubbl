import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { member, milestoneAssignment, payrollEmployee, projectMilestone } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireProjectAccess } from "@/lib/api/project-access";
import { handleError, notFound, validationError } from "@/lib/api/response";
import { z } from "zod";

const createSchema = z
  .object({
    amount: z.number().int().min(0),
    description: z.string().nullable().optional(),
    employeeId: z.string().uuid().optional(),
    memberId: z.string().uuid().optional(),
  })
  .refine((data) => data.employeeId || data.memberId, {
    message: "At least one of employeeId or memberId is required",
  });

// PATCH ?assignmentId=  An empty body marks the assignment paid (the original
// behaviour); pass isPaid false to undo, or change the amount / description.
const updateSchema = z.object({
  isPaid: z.boolean().optional(),
  amount: z.number().int().min(0).optional(),
  description: z.string().nullable().optional(),
});

async function findMilestone(projectId: string, milestoneId: string) {
  return db.query.projectMilestone.findFirst({
    where: and(eq(projectMilestone.id, milestoneId), eq(projectMilestone.projectId, projectId)),
  });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; milestoneId: string }> }
) {
  try {
    const { id, milestoneId } = await params;
    const ctx = await getAuthContext(request);
    await requireProjectAccess(ctx, id, "view");

    const milestone = await findMilestone(id, milestoneId);
    if (!milestone) return notFound("Milestone");

    const assignments = await db.query.milestoneAssignment.findMany({
      where: eq(milestoneAssignment.milestoneId, milestoneId),
      orderBy: (a, { asc }) => [asc(a.createdAt)],
      with: {
        employee: true,
        member: { with: { user: { columns: { id: true, name: true, email: true, image: true } } } },
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

    const body = await request.json();
    const parsed = createSchema.parse(body);

    await requireProjectAccess(ctx, id, "manage");

    const milestone = await findMilestone(id, milestoneId);
    if (!milestone) return notFound("Milestone");

    if (parsed.memberId) {
      const orgMember = await db.query.member.findFirst({
        where: and(eq(member.id, parsed.memberId), eq(member.organizationId, ctx.organizationId)),
        columns: { id: true },
      });
      if (!orgMember) return validationError("Member not found in this organization");
    }
    if (parsed.employeeId) {
      const employee = await db.query.payrollEmployee.findFirst({
        where: and(eq(payrollEmployee.id, parsed.employeeId), eq(payrollEmployee.organizationId, ctx.organizationId)),
        columns: { id: true },
      });
      if (!employee) return validationError("Employee not found in this organization");
    }

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

    const url = new URL(request.url);
    const assignmentId = url.searchParams.get("assignmentId");
    if (!assignmentId) return validationError("assignmentId is required");

    const body = await request.json().catch(() => ({}));
    const parsed = updateSchema.parse(body ?? {});

    await requireProjectAccess(ctx, id, "manage");

    const milestone = await findMilestone(id, milestoneId);
    if (!milestone) return notFound("Milestone");

    const updates: Partial<typeof milestoneAssignment.$inferInsert> = {};
    if (parsed.isPaid !== undefined) updates.isPaid = parsed.isPaid;
    if (parsed.amount !== undefined) updates.amount = parsed.amount;
    if (parsed.description !== undefined) updates.description = parsed.description;
    if (Object.keys(updates).length === 0) updates.isPaid = true;

    const [updated] = await db
      .update(milestoneAssignment)
      .set(updates)
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

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; milestoneId: string }> }
) {
  try {
    const { id, milestoneId } = await params;
    const ctx = await getAuthContext(request);

    const url = new URL(request.url);
    const assignmentId = url.searchParams.get("assignmentId");
    if (!assignmentId) return validationError("assignmentId is required");

    await requireProjectAccess(ctx, id, "manage");

    const milestone = await findMilestone(id, milestoneId);
    if (!milestone) return notFound("Milestone");

    const [removed] = await db
      .delete(milestoneAssignment)
      .where(
        and(
          eq(milestoneAssignment.id, assignmentId),
          eq(milestoneAssignment.milestoneId, milestoneId)
        )
      )
      .returning({ id: milestoneAssignment.id });

    if (!removed) return notFound("Assignment");

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
