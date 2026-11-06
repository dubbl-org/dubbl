import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { projectMember, member } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireProjectAccess } from "@/lib/api/project-access";
import { handleError, notFound, validationError } from "@/lib/api/response";
import { z } from "zod";

const addMemberSchema = z.object({
  memberId: z.string().min(1),
  role: z.enum(["manager", "contributor", "viewer"]).default("contributor"),
  // Client BILLING rate (cents/hr); null/omitted = use project default.
  hourlyRate: z.number().int().min(0).optional(),
  // Internal staff COST rate (cents/hr) used for job-costing profitability.
  costRate: z.number().int().min(0).optional(),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);

    await requireProjectAccess(ctx, id, "view");

    const members = await db.query.projectMember.findMany({
      where: eq(projectMember.projectId, id),
      with: {
        member: {
          with: { user: { columns: { id: true, name: true, email: true, image: true } } },
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

    const body = await request.json();
    const parsed = addMemberSchema.parse(body);

    await requireProjectAccess(ctx, id, "manage");

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
        costRate: parsed.costRate ?? null,
      })
      .returning();

    return NextResponse.json({ projectMember: created }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}

const updateMemberSchema = z.object({
  memberId: z.string().min(1),
  role: z.enum(["manager", "contributor", "viewer"]).optional(),
  hourlyRate: z.number().int().min(0).nullable().optional(),
  costRate: z.number().int().min(0).nullable().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);

    const body = await request.json();
    const parsed = updateMemberSchema.parse(body);

    await requireProjectAccess(ctx, id, "manage");

    const existing = await db.query.projectMember.findFirst({
      where: and(
        eq(projectMember.projectId, id),
        eq(projectMember.memberId, parsed.memberId)
      ),
    });
    if (!existing) return notFound("Project member");

    const updates: Partial<typeof projectMember.$inferInsert> = {};
    if (parsed.role !== undefined) updates.role = parsed.role;
    if (parsed.hourlyRate !== undefined) updates.hourlyRate = parsed.hourlyRate;
    if (parsed.costRate !== undefined) updates.costRate = parsed.costRate;

    const [updated] = await db
      .update(projectMember)
      .set(updates)
      .where(
        and(
          eq(projectMember.projectId, id),
          eq(projectMember.memberId, parsed.memberId)
        )
      )
      .returning();

    return NextResponse.json({ projectMember: updated });
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
    const memberId = url.searchParams.get("memberId");
    if (!memberId) return validationError("memberId is required");

    await requireProjectAccess(ctx, id, "manage");

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
