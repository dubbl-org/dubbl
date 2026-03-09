import { db } from "@/lib/db";
import { payrollRun } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, ok } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "view:payroll-reports");

    const byMonth = await db
      .select({
        month: sql<string>`to_char(${payrollRun.payPeriodEnd}::date, 'YYYY-MM')`,
        totalGross: sql<number>`coalesce(sum(${payrollRun.totalGross}), 0)`.mapWith(Number),
        totalNet: sql<number>`coalesce(sum(${payrollRun.totalNet}), 0)`.mapWith(Number),
        runCount: sql<number>`count(*)`.mapWith(Number),
      })
      .from(payrollRun)
      .where(and(
        eq(payrollRun.organizationId, ctx.organizationId),
        eq(payrollRun.status, "completed"),
        notDeleted(payrollRun.deletedAt)
      ))
      .groupBy(sql`to_char(${payrollRun.payPeriodEnd}::date, 'YYYY-MM')`)
      .orderBy(sql`to_char(${payrollRun.payPeriodEnd}::date, 'YYYY-MM')`);

    return ok({ data: byMonth });
  } catch (err) {
    return handleError(err);
  }
}
