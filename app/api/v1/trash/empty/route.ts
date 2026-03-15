import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { eq, and, isNotNull } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { TRASHABLE_ENTITIES } from "@/lib/api/trash-entities";

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "delete:organization");

    for (const entity of TRASHABLE_ENTITIES) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const table = entity.table as any;

      await db
        .delete(table)
        .where(
          and(
            eq(table.organizationId, ctx.organizationId),
            isNotNull(table.deletedAt),
          )
        );
    }

    logAudit({
      ctx,
      action: "purge",
      entityType: "organization",
      entityId: ctx.organizationId,
      request,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
