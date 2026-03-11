import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { project, projectMember, member } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound, validationError } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { z } from "zod";

const addMemberSchema = z.object({
  memberId: z.string().min(1),
  role: z.enum(["manager", "contributor", "viewer"]).default("contributor"),
  hourlyRate: z.number().int().min(0).optional(),
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

    const members = await db.query.projectMember.findMany({
      where: eq(projectMember.projectId, id),
      with: {
        member: {
          with: { user: true },
        },
      },
    });

    return NextResponse.json({ members });
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
    const parsed = addMemberSchema.parse(body);

    const proj = await db.query.project.findFirst({
      where: and(
        eq(project.id, id),
        eq(project.organizationId, ctx.organizationId),
        notDeleted(project.deletedAt)
      ),
    });

    if (!proj) return notFound("Project");

    // Verify the member belongs to this org
    const orgMember = await db.query.member.findFirst({
      where: and(
        eq(member.id, parsed.memberId),
        eq(member.organizationId, ctx.organizationId)
      ),
    });

    if (!orgMember) return validationError("Member not found in this organization");

    // Check if already added
    const existing = await db.query.projectMember.findFirst({
      where: and(
        eq(projectMember.projectId, id),
        eq(projectMember.memberId, parsed.memberId)
      ),
    });

    if (existing) return validationError("Member already added to this project");

    const [created] = await db
      .insert(projectMember)
      .values({
        projectId: id,
        memberId: parsed.memberId,
        role: parsed.role,
        hourlyRate: parsed.hourlyRate ?? null,
      })
      .returning();

    return NextResponse.json({ projectMember: created }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:projects");

    const url = new URL(request.url);
    const memberId = url.searchParams.get("memberId");
    if (!memberId) return validationError("memberId is required");

    const proj = await db.query.project.findFirst({
      where: and(
        eq(project.id, id),
        eq(project.organizationId, ctx.organizationId),
        notDeleted(project.deletedAt)
      ),
    });

    if (!proj) return notFound("Project");

    await db
      .delete(projectMember)
      .where(
        and(
          eq(projectMember.projectId, id),
          eq(projectMember.memberId, memberId)
        )
      );

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
