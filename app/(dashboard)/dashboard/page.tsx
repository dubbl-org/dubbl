import { getServerContext } from "@/lib/server/context";
import { callRoute } from "@/lib/server/call-route";
import { GET as getEntries } from "@/app/api/v1/entries/route";
import { GET as getPnl } from "@/app/api/v1/reports/profit-and-loss/route";
import { GET as getReceivables } from "@/app/api/v1/reports/aged-receivables/route";
import { GET as getPayables } from "@/app/api/v1/reports/aged-payables/route";
import { GET as getTrends } from "@/app/api/v1/reports/monthly-trends/route";
import { GET as getBudget } from "@/app/api/v1/reports/budget-vs-actual/route";
import { GET as getRatios } from "@/app/api/v1/reports/financial-ratios/route";
import { GET as getAlerts } from "@/app/api/v1/dashboard/alerts/route";
import { GET as getOrganization } from "@/app/api/v1/organization/route";
import DashboardPage, { type DashboardInitial } from "./dashboard-client";

/**
 * The whole landing screen in one server pass. It issues the same nine queries
 * the client used to fire after hydration, in parallel, so the figures are in
 * the HTML instead of arriving a round trip later.
 */
export default async function Page() {
  const ctx = await getServerContext();
  const trends = new URLSearchParams({ months: "6" });

  const [entries, pnl, receivables, payables, monthly, budget, ratios, alerts, organization] =
    await Promise.all([
      callRoute<{ entries?: DashboardInitial["entries"] }>(
        getEntries, ctx, "entries", new URLSearchParams({ limit: "10" })),
      callRoute<DashboardInitial["pnl"]>(getPnl, ctx, "reports/profit-and-loss"),
      callRoute<DashboardInitial["receivables"]>(getReceivables, ctx, "reports/aged-receivables"),
      callRoute<DashboardInitial["payables"]>(getPayables, ctx, "reports/aged-payables"),
      callRoute<{
        revenueSparkline?: number[];
        expenseSparkline?: number[];
        netIncomeSparkline?: number[];
      }>(getTrends, ctx, "reports/monthly-trends", trends),
      callRoute<{ comparisons?: Array<{ accountName: string; budgeted: number; actual: number }> }>(
        getBudget, ctx, "reports/budget-vs-actual"),
      callRoute<{ ratios?: DashboardInitial["ratios"] }>(
        getRatios, ctx, "reports/financial-ratios"),
      callRoute<DashboardInitial["actionAlerts"]>(getAlerts, ctx, "dashboard/alerts"),
      callRoute<{ organization?: { onboardingCompletedAt?: string | null } }>(
        getOrganization, ctx, "organization"),
    ]);

  // Same threshold the client used: budgets at or past 90% become alerts.
  const budgetAlerts = (budget?.comparisons ?? [])
    .filter((c) => c.budgeted > 0 && c.actual / c.budgeted >= 0.9)
    .map((c) => ({
      accountName: c.accountName,
      pct: Math.round((c.actual / c.budgeted) * 100),
      budgeted: c.budgeted,
      actual: c.actual,
    }));

  // A missing entries or P&L payload means the database did not answer, and
  // showing zeros would read as "you earned nothing". Say so instead.
  const failed = !entries || !pnl;

  return (
    <DashboardPage
      initialError={failed ? "Failed to load dashboard data. Please check your connection." : null}
      initialData={{
        entries: entries?.entries?.map((e) => ({
          ...e,
          totalDebit: (e as { totalDebit?: string }).totalDebit || "0.00",
        })),
        pnl: pnl ?? undefined,
        receivables: receivables?.buckets ? receivables : undefined,
        payables: payables?.buckets ? payables : undefined,
        sparklines: monthly?.revenueSparkline
          ? {
              revenue: monthly.revenueSparkline,
              expenses: monthly.expenseSparkline ?? [],
              netIncome: monthly.netIncomeSparkline ?? [],
            }
          : undefined,
        budgetAlerts,
        ratios: ratios?.ratios ?? null,
        actionAlerts: alerts ?? null,
        showOnboarding: Boolean(
          organization?.organization && !organization.organization.onboardingCompletedAt
        ),
      }}
    />
  );
}
