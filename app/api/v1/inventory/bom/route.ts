import { db } from "@/lib/db";
import { billOfMaterials } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { notDeleted } from "@/lib/db/soft-delete";
import { ok, created, handleError } from "@/lib/api/response";
import { z } from "zod";

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);

    const boms = await db.query.billOfMaterials.findMany({
      where: and(
        eq(billOfMaterials.organizationId, ctx.organizationId),
        notDeleted(billOfMaterials.deletedAt)
      ),
      with: { assemblyItem: true, components: { with: { componentItem: true } } },
      orderBy: billOfMaterials.createdAt,
    });

    return ok({ data: boms });
  } catch (err) {
    return handleError(err);
  }
}

const createSchema = z.object({
  assemblyItemId: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  laborCostCents: z.number().int().min(0).optional(),
  overheadCostCents: z.number().int().min(0).optional(),
});

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:inventory");

    const body = await request.json();
    const parsed = createSchema.parse(body);

    const [bom] = await db
      .insert(billOfMaterials)
      .values({
        organizationId: ctx.organizationId,
        ...parsed,
      })
      .returning();

    return created({ bom });
  } catch (err) {
    return handleError(err);
  }
}
