import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { team } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  color: z.string().optional(),
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
      with: {
        members: {
          with: {
            member: {
              with: { user: true },
            },
          },
        },
      },
    });

    if (!found) return notFound("Team");
    return NextResponse.json({ team: found });
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:teams");

    const body = await request.json();
    const parsed = updateSchema.parse(body);

    const existing = await db.query.team.findFirst({
      where: and(
        eq(team.id, id),
        eq(team.organizationId, ctx.organizationId)
      ),
    });

    if (!existing) return notFound("Team");

    const [updated] = await db
      .update(team)
      .set({ ...parsed, updatedAt: new Date() })
      .where(eq(team.id, id))
      .returning();

    return NextResponse.json({ team: updated });
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

    const existing = await db.query.team.findFirst({
      where: and(
        eq(team.id, id),
        eq(team.organizationId, ctx.organizationId)
      ),
    });

    if (!existing) return notFound("Team");

    await db.delete(team).where(eq(team.id, id));

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
