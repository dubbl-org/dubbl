import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { payrollEmployee, payrollRun } from "@/lib/db/schema";
import { notDeleted } from "@/lib/db/soft-delete";

/** Payroll landing screen: employees and runs, mirroring both list endpoints. */
export async function listPayrollEmployees(organizationId: string) {
  return db.query.payrollEmployee.findMany({
    where: and(
      eq(payrollEmployee.organizationId, organizationId),
      notDeleted(payrollEmployee.deletedAt)
    ),
    orderBy: desc(payrollEmployee.createdAt),
    with: { member: { with: { user: true } } },
  });
}

export async function listPayrollRuns(organizationId: string) {
  return db.query.payrollRun.findMany({
    where: and(
      eq(payrollRun.organizationId, organizationId),
      notDeleted(payrollRun.deletedAt)
    ),
    orderBy: desc(payrollRun.createdAt),
    with: { items: { with: { employee: true } } },
  });
}
