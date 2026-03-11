import { db } from "@/lib/db";
import { payrollBonus, payrollRun } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, ok, created, notFound } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { logAudit } from "@/lib/api/audit";
import { z } from "zod";

const createSchema = z.object({
  employeeId: z.string().uuid(),
  bonusType: z.enum(["performance", "signing", "referral", "holiday", "spot", "retention", "other"]),
  amount: z.number().int().min(1),
  description: z.string().optional(),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:payroll");

    const run = await db.query.payrollRun.findFirst({
      where: and(
        eq(payrollRun.id, id),
        eq(payrollRun.organizationId, ctx.organizationId),
        notDeleted(payrollRun.deletedAt)
      ),
    });
    if (!run) return notFound("Payroll run");

    const bonuses = await db.query.payrollBonus.findMany({
      where: eq(payrollBonus.payrollRunId, id),
      with: { employee: true },
    });

    return ok({ data: bonuses });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:payroll");

    const body = await request.json();
    const parsed = createSchema.parse(body);

    const [bonus] = await db
      .insert(payrollBonus)
      .values({ payrollRunId: id, ...parsed })
      .returning();

    logAudit({ ctx, action: "create", entityType: "payrollBonus", entityId: bonus.id, request });

    return created({ bonus });
  } catch (err) {
    return handleError(err);
  }
}
