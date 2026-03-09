import { db } from "@/lib/db";
import { leavePolicy } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, ok, created } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { logAudit } from "@/lib/api/audit";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(1),
  leaveType: z.enum(["vacation", "sick", "personal", "parental", "bereavement", "unpaid", "other"]),
  accrualMethod: z.enum(["per_pay_period", "monthly", "annually", "front_loaded"]).optional(),
  accrualRate: z.number().min(0).optional(),
  maxBalance: z.number().nullable().optional(),
  carryOverMax: z.number().nullable().optional(),
});

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:leave");

    const policies = await db.query.leavePolicy.findMany({
      where: and(
        eq(leavePolicy.organizationId, ctx.organizationId),
        notDeleted(leavePolicy.deletedAt)
      ),
    });

    return ok({ data: policies });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:leave");

    const body = await request.json();
    const parsed = createSchema.parse(body);

    const [policy] = await db
      .insert(leavePolicy)
      .values({ organizationId: ctx.organizationId, ...parsed })
      .returning();

    logAudit({ ctx, action: "create", entityType: "leavePolicy", entityId: policy.id, request });

    return created({ policy });
  } catch (err) {
    return handleError(err);
  }
}
