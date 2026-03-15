import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { restoreFromSnapshot } from "@/lib/api/backup-snapshot";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "delete:organization");

    const { id } = await params;
    const body = await request.json();

    if (body.confirm !== true) {
      return NextResponse.json(
        { error: "You must confirm the restore by setting confirm: true" },
        { status: 400 },
      );
    }

    const restoredCounts = await restoreFromSnapshot(ctx.organizationId, id, ctx);

    logAudit({
      ctx,
      action: "restore_backup",
      entityType: "organization",
      entityId: ctx.organizationId,
      changes: { backupId: id },
      request,
    });

    return NextResponse.json({ success: true, restoredCounts });
  } catch (err) {
    return handleError(err);
  }
}
