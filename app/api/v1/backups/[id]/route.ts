import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { dataBackup } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { notDeleted, softDelete } from "@/lib/db/soft-delete";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "view:audit-log");

    const { id } = await params;

    const backup = await db.query.dataBackup.findFirst({
      where: and(
        eq(dataBackup.id, id),
        eq(dataBackup.organizationId, ctx.organizationId),
        notDeleted(dataBackup.deletedAt),
      ),
    });

    if (!backup) throw notFound("Backup");

    return NextResponse.json({ backup });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "delete:organization");

    const { id } = await params;

    const backup = await db.query.dataBackup.findFirst({
      where: and(
        eq(dataBackup.id, id),
        eq(dataBackup.organizationId, ctx.organizationId),
        notDeleted(dataBackup.deletedAt),
      ),
    });

    if (!backup) throw notFound("Backup");

    // Soft-delete the backup record (S3 file kept for recovery via trash)
    await db
      .update(dataBackup)
      .set(softDelete())
      .where(eq(dataBackup.id, id));

    logAudit({
      ctx,
      action: "delete",
      entityType: "data_backup",
      entityId: id,
      changes: backup as Record<string, unknown>,
      request,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
