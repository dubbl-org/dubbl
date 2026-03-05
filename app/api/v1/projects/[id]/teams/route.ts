import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { project, projectTeam, projectTeamMember } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(1),
  color: z.string().default("#3b82f6"),
  memberIds: z.array(z.string()).default([]),
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

    const teams = await db.query.projectTeam.findMany({
      where: eq(projectTeam.projectId, id),
      with: {
        members: {
          with: { member: { with: { user: true } } },
        },
      },
    });

    return NextResponse.json({ teams });
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
      .insert(projectTeam)
      .values({
        projectId: id,
        name: parsed.name,
        color: parsed.color,
      })
      .returning();

    if (parsed.memberIds.length > 0) {
      await db.insert(projectTeamMember).values(
        parsed.memberIds.map((memberId) => ({
          teamId: created.id,
          memberId,
        }))
      );
    }

    return NextResponse.json({ team: created }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
