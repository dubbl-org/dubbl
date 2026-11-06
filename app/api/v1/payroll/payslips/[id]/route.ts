import { db } from "@/lib/db";
import { member, payslip } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { hasPermission } from "@/lib/plans";
import { handleError, ok, notFound } from "@/lib/api/response";
import { loadOrgPayslip } from "@/lib/api/payslips";

/**
 * One payslip. Payroll managers can read any payslip in the org; anyone else
 * only their own. It is marked "Opened" only when the employee themself opens
 * it, not when a manager looks at it.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "view:payslips");

    const ps = await loadOrgPayslip(ctx.organizationId, id);
    if (!ps) return notFound("Payslip");

    const me = await db.query.member.findFirst({
      where: and(eq(member.userId, ctx.userId), eq(member.organizationId, ctx.organizationId)),
      columns: { id: true },
    });
    const isOwn = !!me && ps.employee?.memberId === me.id;
    const canManage = hasPermission(ctx.permissions ?? ctx.role, "manage:payroll");
    if (!isOwn && !canManage) return notFound("Payslip");

    if (isOwn && (ps.status === "generated" || ps.status === "sent")) {
      await db
        .update(payslip)
        .set({ status: "viewed", viewedAt: new Date() })
        .where(eq(payslip.id, id));
    }

    return ok({ payslip: ps });
  } catch (err) {
    return handleError(err);
  }
}
