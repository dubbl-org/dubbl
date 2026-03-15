import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tag } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError, notFound } from "@/lib/api/response";
import { logAudit, diffChanges } from "@/lib/api/audit";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  color: z.string().optional(),
  description: z.string().nullable().optional(),
});

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getAuthContext(request);
    const { id } = await params;

    const existing = await db.query.tag.findFirst({
      where: eq(tag.id, id),
    });

    if (!existing || existing.organizationId !== ctx.organizationId) {
      return notFound("Tag");
    }

    const body = await request.json();
    const parsed = updateSchema.parse(body);

    const [updated] = await db
      .update(tag)
      .set(parsed)
      .where(eq(tag.id, id))
      .returning();

    logAudit({ ctx, action: "update", entityType: "tag", entityId: id, changes: diffChanges(existing as Record<string, unknown>, updated as Record<string, unknown>), request });

    return NextResponse.json({ tag: updated });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getAuthContext(request);
    const { id } = await params;

    const existing = await db.query.tag.findFirst({
      where: eq(tag.id, id),
    });

    if (!existing || existing.organizationId !== ctx.organizationId) {
      return notFound("Tag");
    }

    await db
      .update(tag)
      .set({ deletedAt: new Date() })
      .where(eq(tag.id, id));

    logAudit({ ctx, action: "delete", entityType: "tag", entityId: id, request });

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
