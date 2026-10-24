import { getServerContext } from "@/lib/server/context";
import { listPayrollEmployees, listPayrollRuns } from "@/lib/server/data/payroll";
import { toClient } from "@/lib/server/data/serialize";
import PayrollPage, { type Employee, type PayrollRun } from "./payroll-client";

export default async function Page() {
  const ctx = await getServerContext();
  const [employees, runs] = await Promise.all([
    listPayrollEmployees(ctx.organizationId),
    listPayrollRuns(ctx.organizationId),
  ]);
  return (
    <PayrollPage
      initialEmployees={toClient<Employee[]>(employees)}
      initialRuns={toClient<PayrollRun[]>(runs)}
    />
  );
}
