import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { and, eq, gt, isNotNull, ilike, desc } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { TRASHABLE_ENTITIES } from "@/lib/api/trash-entities";

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "view:data");

    const { searchParams } = new URL(request.url);
    const entityType = searchParams.get("entityType");
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.max(1, Math.min(100, parseInt(searchParams.get("limit") || "30", 10)));
    const search = searchParams.get("search") || undefined;

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const entities = entityType
      ? TRASHABLE_ENTITIES.filter((e) => e.type === entityType)
      : TRASHABLE_ENTITIES;

    const allResults: {
      id: string;
      name: string | null;
      deletedAt: Date;
      entityType: string;
      label: string;
    }[] = [];

    for (const entity of entities) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const table = entity.table as any;

      const rows = await db
        .select({
          id: table.id,
          name: table[entity.nameCol],
          deletedAt: table.deletedAt,
        })
        .from(table)
        .where(
          and(
            eq(table.organizationId, ctx.organizationId),
            isNotNull(table.deletedAt),
            gt(table.deletedAt, thirtyDaysAgo),
            ...(search ? [ilike(table[entity.nameCol], `%${search}%`)] : []),
          )
        )
        .orderBy(desc(table.deletedAt));

      for (const row of rows) {
        allResults.push({
          id: row.id,
          name: row.name,
          deletedAt: row.deletedAt,
          entityType: entity.type,
          label: entity.label,
        });
      }
    }

    // Sort merged results by deletedAt descending
    allResults.sort(
      (a, b) => new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime()
    );

    const total = allResults.length;
    const offset = (page - 1) * limit;
    const data = allResults.slice(offset, offset + limit);

    return NextResponse.json({ data, total });
  } catch (err) {
    return handleError(err);
  }
}
