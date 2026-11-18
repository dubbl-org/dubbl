import { getServerContext } from "@/lib/server/context";
import { callRoute } from "@/lib/server/call-route";
import { GET } from "@/app/api/v1/reports/expense-analytics/route";
import ExpenseAnalyticsPage from "./expense-analytics-client";

export default async function Page() {
  const ctx = await getServerContext();
  const now = new Date();
  const params = new URLSearchParams({ startDate: String(`${now.getFullYear()}-01-01`), endDate: String(now.toISOString().slice(0, 10)) });
  const data = await callRoute<Record<string, unknown>>(GET, ctx, "reports/expense-analytics", params);
  return <ExpenseAnalyticsPage initialData={data} />;
}
