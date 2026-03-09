import { db } from "@/lib/db";
import { payrollRun, payrollItem, payrollEmployee } from "@/lib/db/schema";
import { eq, and, gte, lte } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "view:payroll-reports");

    const url = new URL(request.url);
    const startDate = url.searchParams.get("startDate");
    const endDate = url.searchParams.get("endDate");

    const conditions = [
      eq(payrollRun.organizationId, ctx.organizationId),
      eq(payrollRun.status, "completed"),
      notDeleted(payrollRun.deletedAt),
    ];

    if (startDate) conditions.push(gte(payrollRun.payPeriodStart, startDate));
    if (endDate) conditions.push(lte(payrollRun.payPeriodEnd, endDate));

    const runs = await db.query.payrollRun.findMany({
      where: and(...conditions),
      with: { items: { with: { employee: true } } },
    });

    const rows: string[] = ["Employee,Employee #,Period Start,Period End,Gross,Tax,Deductions,Net"];

    for (const run of runs) {
      for (const item of run.items) {
        rows.push([
          item.employee?.name || "",
          item.employee?.employeeNumber || "",
          run.payPeriodStart,
          run.payPeriodEnd,
          (item.grossAmount / 100).toFixed(2),
          (item.taxAmount / 100).toFixed(2),
          (item.deductions / 100).toFixed(2),
          (item.netAmount / 100).toFixed(2),
        ].join(","));
      }
    }

    return new Response(rows.join("\n"), {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": "attachment; filename=payroll-export.csv",
      },
    });
  } catch (err) {
    return handleError(err);
  }
}
