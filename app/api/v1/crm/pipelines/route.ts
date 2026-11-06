import { db } from "@/lib/db";
import { pipeline } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { CRM_PERMISSION, clearOtherDefaults } from "@/lib/api/crm-deals";
import { normalizePipelineStages } from "@/lib/crm/rules";
import { notDeleted } from "@/lib/db/soft-delete";
import { ok, created, handleError } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { z } from "zod";

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);

    const pipelines = await db.query.pipeline.findMany({
      where: and(
        eq(pipeline.organizationId, ctx.organizationId),
        notDeleted(pipeline.deletedAt)
      ),
      orderBy: pipeline.createdAt,
    });

    return ok({ pipelines });
  } catch (err) {
    return handleError(err);
  }
}

const createSchema = z.object({
  name: z.string().min(1),
  stages: z.array(z.object({
    id: z.string(),
    name: z.string(),
    color: z.string(),
  })),
  isDefault: z.boolean().optional(),
});

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, CRM_PERMISSION);

    const body = await request.json();
    const parsed = createSchema.parse(body);

    const p = await db.transaction(async (tx) => {
      // The first pipeline is the default; after that only one can be.
      const existing = await tx.query.pipeline.findFirst({
        where: and(eq(pipeline.organizationId, ctx.organizationId), notDeleted(pipeline.deletedAt)),
        columns: { id: true },
      });
      const [row] = await tx
        .insert(pipeline)
        .values({
          organizationId: ctx.organizationId,
          name: parsed.name,
          // Won and Lost are always part of a pipeline.
          stages: normalizePipelineStages(parsed.stages),
          isDefault: parsed.isDefault ?? !existing,
        })
        .returning();
      if (row.isDefault) await clearOtherDefaults(tx, ctx.organizationId, row.id);
      return row;
    });

    logAudit({ ctx, action: "create", entityType: "pipeline", entityId: p.id, request });

    return created({ pipeline: p });
  } catch (err) {
    return handleError(err);
  }
}
