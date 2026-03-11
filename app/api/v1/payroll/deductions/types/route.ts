import { db } from "@/lib/db";
import { deductionType } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, ok, created } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { logAudit } from "@/lib/api/audit";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  category: z.enum(["pre_tax", "post_tax"]),
  defaultAmount: z.number().int().optional(),
  defaultPercent: z.number().optional(),
});

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:payroll");

    const types = await db.query.deductionType.findMany({
      where: and(
        eq(deductionType.organizationId, ctx.organizationId),
        notDeleted(deductionType.deletedAt)
      ),
    });

    return ok({ data: types });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:payroll");

    const body = await request.json();
    const parsed = createSchema.parse(body);

    const [dt] = await db
      .insert(deductionType)
      .values({ organizationId: ctx.organizationId, ...parsed })
      .returning();

    logAudit({ ctx, action: "create", entityType: "deductionType", entityId: dt.id, request });

    return created({ deductionType: dt });
  } catch (err) {
    return handleError(err);
  }
}
