import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { dataBackup } from "@/lib/db/schema";
import { eq, desc, and, count } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { createOrgSnapshot, checkSnapshotRateLimit } from "@/lib/api/backup-snapshot";
import { notDeleted } from "@/lib/db/soft-delete";

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "view:audit-log");

    const url = new URL(request.url);
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "20")));
    const offset = (page - 1) * limit;

    const whereClause = and(
      eq(dataBackup.organizationId, ctx.organizationId),
      notDeleted(dataBackup.deletedAt),
    );

    const [backups, [{ total }]] = await Promise.all([
      db.query.dataBackup.findMany({
        where: whereClause,
        orderBy: desc(dataBackup.createdAt),
        limit,
        offset,
      }),
      db
        .select({ total: count() })
        .from(dataBackup)
        .where(whereClause),
    ]);

    return NextResponse.json({ data: backups, total });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "view:audit-log");

    const { allowed, retryAfter } = await checkSnapshotRateLimit(ctx.organizationId);
    if (!allowed) {
      return NextResponse.json(
        { error: `Snapshot rate limit reached. Try again in ${retryAfter} seconds.` },
        { status: 429 },
      );
    }

    const maxManual = 10;

    const [{ total: manualCount }] = await db
      .select({ total: count() })
      .from(dataBackup)
      .where(
        and(
          eq(dataBackup.organizationId, ctx.organizationId),
          eq(dataBackup.type, "manual"),
          notDeleted(dataBackup.deletedAt),
        )
      );

    if (manualCount >= maxManual) {
      return NextResponse.json(
        { error: `Manual backup limit reached (${maxManual})` },
        { status: 403 },
      );
    }

    const backup = await createOrgSnapshot(ctx.organizationId, ctx.userId, "manual");

    // Set expiresAt to 30 days from now
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    const [updated] = await db
      .update(dataBackup)
      .set({ expiresAt })
      .where(eq(dataBackup.id, backup.id))
      .returning();

    logAudit({
      ctx,
      action: "create",
      entityType: "data_backup",
      entityId: updated.id,
      request,
    });

    return NextResponse.json({ backup: updated }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
