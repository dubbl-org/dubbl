import { db } from "@/lib/db";
import { payrollBonus, payrollRun } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, ok, created, notFound } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { logAudit } from "@/lib/api/audit";
import { addBonusToRun } from "@/lib/api/payroll-run-actions";
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

    return ok({ bonuses });
  } catch (err) {
    return handleError(err);
  }
}

/**
 * Add a bonus to an unfinished run. The employee's pay item is recalculated
 * with the bonus included in gross and taxed with it, and the run totals are
 * updated, so the bonus is paid and posted when the run is finished. Adding a
 * bonus clears any sign-off, since the figures changed.
 */
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

    const result = await addBonusToRun(ctx, id, parsed);

    logAudit({ ctx, action: "create", entityType: "payrollBonus", entityId: result.bonus.id, request });

    return created(result);
  } catch (err) {
    return handleError(err);
  }
}
