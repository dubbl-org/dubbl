import { db } from "@/lib/db";
import { compensationBand } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, ok, created } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { logAudit } from "@/lib/api/audit";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(1),
  level: z.string().optional(),
  minSalary: z.number().int(),
  midSalary: z.number().int(),
  maxSalary: z.number().int(),
  currency: z.string().max(3).optional(),
});

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:compensation");

    const bands = await db.query.compensationBand.findMany({
      where: and(
        eq(compensationBand.organizationId, ctx.organizationId),
        notDeleted(compensationBand.deletedAt)
      ),
    });

    return ok({ data: bands });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:compensation");

    const body = await request.json();
    const parsed = createSchema.parse(body);

    const [band] = await db
      .insert(compensationBand)
      .values({ organizationId: ctx.organizationId, ...parsed })
      .returning();

    logAudit({ ctx, action: "create", entityType: "compensationBand", entityId: band.id, request });

    return created({ band });
  } catch (err) {
    return handleError(err);
  }
}
