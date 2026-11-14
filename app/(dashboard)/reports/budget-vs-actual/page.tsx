import { getServerContext } from "@/lib/server/context";
import { callRoute } from "@/lib/server/call-route";
import { GET as getBudgets } from "@/app/api/v1/budgets/route";
import { GET as getReport } from "@/app/api/v1/reports/budget-vs-actual/route";
import BudgetVsActualPage, { type BudgetVsActualInitial } from "./budget-vs-actual-client";

/** The budget list plus a report for the one it opens on. */
export default async function Page() {
  const ctx = await getServerContext();
  const list = await callRoute<{ data?: BudgetVsActualInitial["budgets"] }>(
    getBudgets,
    ctx,
    "budgets",
    new URLSearchParams({ limit: "100" })
  );

  const budgets = list?.data ?? [];
  const first = budgets[0];
  const report = first
    ? await callRoute<BudgetVsActualInitial>(
        getReport,
        ctx,
        "reports/budget-vs-actual",
        new URLSearchParams({ budgetId: first.id })
      )
    : null;

  return <BudgetVsActualPage initialData={{ budgets, ...report }} />;
}
