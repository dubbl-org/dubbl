import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { team, teamMember, member } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound, validationError } from "@/lib/api/response";
import { z } from "zod";

const addMemberSchema = z.object({
  memberId: z.string().uuid(),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);

    const found = await db.query.team.findFirst({
      where: and(
        eq(team.id, id),
        eq(team.organizationId, ctx.organizationId)
      ),
    });

    if (!found) return notFound("Team");

    const members = await db.query.teamMember.findMany({
      where: eq(teamMember.teamId, id),
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
    requireRole(ctx, "manage:teams");

    const found = await db.query.team.findFirst({
      where: and(
        eq(team.id, id),
        eq(team.organizationId, ctx.organizationId)
      ),
    });

    if (!found) return notFound("Team");

    const body = await request.json();
    const parsed = addMemberSchema.parse(body);

    // Validate member belongs to org
    const orgMember = await db.query.member.findFirst({
      where: and(
        eq(member.id, parsed.memberId),
        eq(member.organizationId, ctx.organizationId)
      ),
    });

    if (!orgMember) return notFound("Member");

    // Check for duplicates
    const existing = await db.query.teamMember.findFirst({
      where: and(
        eq(teamMember.teamId, id),
        eq(teamMember.memberId, parsed.memberId)
      ),
    });

    if (existing) return validationError("Member is already in this team");

    const [created] = await db
      .insert(teamMember)
      .values({
        teamId: id,
        memberId: parsed.memberId,
      })
      .returning();

    return NextResponse.json({ teamMember: created }, { status: 201 });
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
    requireRole(ctx, "manage:teams");

    const url = new URL(request.url);
    const memberId = url.searchParams.get("memberId");

    if (!memberId) return validationError("memberId query param is required");

    const found = await db.query.team.findFirst({
      where: and(
        eq(team.id, id),
        eq(team.organizationId, ctx.organizationId)
      ),
    });

    if (!found) return notFound("Team");

    const existing = await db.query.teamMember.findFirst({
      where: and(
        eq(teamMember.teamId, id),
        eq(teamMember.memberId, memberId)
      ),
    });

    if (!existing) return notFound("Team member");

    await db
      .delete(teamMember)
      .where(
        and(
          eq(teamMember.teamId, id),
          eq(teamMember.memberId, memberId)
        )
      );

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
