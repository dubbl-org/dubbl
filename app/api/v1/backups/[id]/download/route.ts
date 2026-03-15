import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { dataBackup } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { downloadBackup } from "@/lib/api/backup-storage";
import { notDeleted } from "@/lib/db/soft-delete";

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

    if (backup.status !== "completed" || !backup.fileKey) {
      return NextResponse.json(
        { error: "Backup is not available for download" },
        { status: 400 },
      );
    }

    const jsonStr = await downloadBackup(backup.fileKey);

    return new NextResponse(jsonStr, {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename=dubbl-backup-${backup.id}.json`,
      },
    });
  } catch (err) {
    return handleError(err);
  }
}
