import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { project, projectTeamAssignment } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound, validationError } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { z } from "zod";

const assignTeamSchema = z.object({
  teamId: z.string().min(1),
  defaultRole: z.enum(["manager", "contributor", "viewer"]).default("contributor"),
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

    const assignments = await db.query.projectTeamAssignment.findMany({
      where: eq(projectTeamAssignment.projectId, id),
      with: {
        team: {
          with: {
            members: {
              with: {
                member: {
                  with: { user: true },
                },
              },
            },
          },
        },
      },
    });

    return NextResponse.json({ assignments });
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
    const parsed = assignTeamSchema.parse(body);

    const proj = await db.query.project.findFirst({
      where: and(
        eq(project.id, id),
        eq(project.organizationId, ctx.organizationId),
        notDeleted(project.deletedAt)
      ),
    });

    if (!proj) return notFound("Project");

    // Check for duplicate assignment
    const existing = await db.query.projectTeamAssignment.findFirst({
      where: and(
        eq(projectTeamAssignment.projectId, id),
        eq(projectTeamAssignment.teamId, parsed.teamId)
      ),
    });

    if (existing) return validationError("Team already assigned to this project");

    const [created] = await db
      .insert(projectTeamAssignment)
      .values({
        projectId: id,
        teamId: parsed.teamId,
        defaultRole: parsed.defaultRole,
      })
      .returning();

    return NextResponse.json({ assignment: created }, { status: 201 });
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
    const teamId = url.searchParams.get("teamId");
    if (!teamId) return validationError("teamId is required");

    const proj = await db.query.project.findFirst({
      where: and(
        eq(project.id, id),
        eq(project.organizationId, ctx.organizationId),
        notDeleted(project.deletedAt)
      ),
    });

    if (!proj) return notFound("Project");

    await db
      .delete(projectTeamAssignment)
      .where(
        and(
          eq(projectTeamAssignment.projectId, id),
          eq(projectTeamAssignment.teamId, teamId)
        )
      );

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
