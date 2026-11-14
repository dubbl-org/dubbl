import { getServerContext } from "@/lib/server/context";
import { callRoute } from "@/lib/server/call-route";
import { GET } from "@/app/api/v1/reports/executive-summary/route";
import ExecutiveSummaryPage from "./executive-summary-client";

export default async function Page() {
  const ctx = await getServerContext();
  const now = new Date();
  const params = new URLSearchParams({ startDate: String(`${now.getFullYear()}-01-01`), endDate: String(now.toISOString().slice(0, 10)), basis: String("accrual") });
  const data = await callRoute<Record<string, unknown>>(GET, ctx, "reports/executive-summary", params);
  return <ExecutiveSummaryPage initialData={data} />;
}
