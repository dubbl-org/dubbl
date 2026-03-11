import { db } from "@/lib/db";
import { pipeline } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { notDeleted } from "@/lib/db/soft-delete";
import { ok, created, handleError } from "@/lib/api/response";
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
    requireRole(ctx, "manage:contacts");

    const body = await request.json();
    const parsed = createSchema.parse(body);

    const [p] = await db
      .insert(pipeline)
      .values({
        organizationId: ctx.organizationId,
        ...parsed,
      })
      .returning();

    return created({ pipeline: p });
  } catch (err) {
    return handleError(err);
  }
}
