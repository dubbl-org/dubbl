import { db } from "@/lib/db";
import { payrollRun, payrollItem, payslip } from "@/lib/db/schema";
import { eq, and, sql, lte } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, ok, notFound, validationError } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { logAudit } from "@/lib/api/audit";

export async function POST(
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
      with: { items: { with: { employee: true } } },
    });

    if (!run) return notFound("Payroll run");
    if (run.status !== "completed") return validationError("Can only generate payslips for completed runs");

    // Calculate YTD values per employee
    const payslips: (typeof payslip.$inferInsert)[] = [];

    for (const item of run.items) {
      // Get YTD totals for this employee across all completed runs up to this one
      const [ytd] = await db
        .select({
          ytdGross: sql<number>`coalesce(sum(${payrollItem.grossAmount}), 0)`.mapWith(Number),
          ytdNet: sql<number>`coalesce(sum(${payrollItem.netAmount}), 0)`.mapWith(Number),
          ytdTax: sql<number>`coalesce(sum(${payrollItem.taxAmount}), 0)`.mapWith(Number),
        })
        .from(payrollItem)
        .innerJoin(payrollRun, eq(payrollItem.payrollRunId, payrollRun.id))
        .where(and(
          eq(payrollItem.employeeId, item.employeeId),
          eq(payrollRun.status, "completed"),
          eq(payrollRun.organizationId, ctx.organizationId),
          lte(payrollRun.payPeriodEnd, run.payPeriodEnd)
        ));

      payslips.push({
        payrollRunId: run.id,
        employeeId: item.employeeId,
        payrollItemId: item.id,
        grossAmount: item.grossAmount,
        netAmount: item.netAmount,
        taxAmount: item.taxAmount,
        deductionsBreakdown: [],
        ytdGross: ytd?.ytdGross || 0,
        ytdNet: ytd?.ytdNet || 0,
        ytdTax: ytd?.ytdTax || 0,
      });
    }

    if (payslips.length > 0) {
      await db.insert(payslip).values(payslips);
    }

    logAudit({ ctx, action: "generate_payslips", entityType: "payrollRun", entityId: id, request });

    return ok({ count: payslips.length });
  } catch (err) {
    return handleError(err);
  }
}
