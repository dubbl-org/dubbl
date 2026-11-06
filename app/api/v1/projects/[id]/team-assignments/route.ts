import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { projectTeamAssignment, team } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireProjectAccess } from "@/lib/api/project-access";
import { handleError, notFound, validationError } from "@/lib/api/response";
import { addTeamAssignmentMembers, releaseTeamAssignmentMembers } from "@/lib/api/project-team-members";
import { z } from "zod";

const assignTeamSchema = z.object({
  teamId: z.string().uuid(),
  defaultRole: z.enum(["manager", "contributor", "viewer"]).default("contributor"),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);

    await requireProjectAccess(ctx, id, "view");

    const assignments = await db.query.projectTeamAssignment.findMany({
      where: eq(projectTeamAssignment.projectId, id),
      with: {
        team: {
          with: {
            members: {
              with: {
                member: {
                  with: { user: { columns: { id: true, name: true, email: true, image: true } } },
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

    const body = await request.json();
    const parsed = assignTeamSchema.parse(body);

    await requireProjectAccess(ctx, id, "manage");

    const orgTeam = await db.query.team.findFirst({
      where: and(
        eq(team.id, parsed.teamId),
        eq(team.organizationId, ctx.organizationId)
      ),
    });

    if (!orgTeam) return notFound("Team");

    // Check for duplicate assignment
    const existing = await db.query.projectTeamAssignment.findFirst({
      where: and(
        eq(projectTeamAssignment.projectId, id),
        eq(projectTeamAssignment.teamId, parsed.teamId)
      ),
    });

    if (existing) return validationError("Team already assigned to this project");

    // Assigning the team adds its people as project members with the chosen role.
    const { created, addedMembers } = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(projectTeamAssignment)
        .values({
          projectId: id,
          teamId: parsed.teamId,
          defaultRole: parsed.defaultRole,
        })
        .returning();
      const addedMembers = await addTeamAssignmentMembers(tx, created);
      return { created, addedMembers };
    });

    return NextResponse.json({ assignment: created, addedMembers }, { status: 201 });
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

    const url = new URL(request.url);
    const teamId = url.searchParams.get("teamId");
    if (!teamId) return validationError("teamId is required");

    await requireProjectAccess(ctx, id, "manage");

    // People who got access through this team lose it (unless another assigned team includes them).
    await db.transaction(async (tx) => {
      const removed = await tx
        .delete(projectTeamAssignment)
        .where(
          and(
            eq(projectTeamAssignment.projectId, id),
            eq(projectTeamAssignment.teamId, teamId)
          )
        )
        .returning({ id: projectTeamAssignment.id });
      await releaseTeamAssignmentMembers(tx, removed.map((r) => r.id));
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
