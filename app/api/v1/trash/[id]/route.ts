import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { eq, and, isNotNull } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { getTrashEntity } from "@/lib/api/trash-entities";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);

    const body = await request.json();
    const { entityType } = body;

    if (!entityType) {
      return NextResponse.json({ error: "entityType is required" }, { status: 400 });
    }

    const entity = getTrashEntity(entityType);
    if (!entity) {
      return NextResponse.json({ error: "Invalid entity type" }, { status: 400 });
    }

    requireRole(ctx, entity.permission);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const table = entity.table as any;

    // Verify the record exists, is soft-deleted, and belongs to the org
    const [record] = await db
      .select({ id: table.id })
      .from(table)
      .where(
        and(
          eq(table.id, id),
          eq(table.organizationId, ctx.organizationId),
          isNotNull(table.deletedAt),
        )
      );

    if (!record) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Hard delete
    await db.delete(table).where(eq(table.id, id));

    logAudit({
      ctx,
      action: "purge",
      entityType,
      entityId: id,
      request,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
