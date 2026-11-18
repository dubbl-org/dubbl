import { getServerContext } from "@/lib/server/context";
import { callRoute } from "@/lib/server/call-route";
import { GET } from "@/app/api/v1/reports/tracking-category/route";
import TrackingReportPage from "./tracking-client";

export default async function Page() {
  const ctx = await getServerContext();
  const now = new Date();
  const params = new URLSearchParams({ startDate: String(`${(new Date()).getFullYear()}-01-01`), endDate: String((new Date()).toISOString().slice(0, 10)), basis: String("accrual"), dimension: String("costCenterId"), mode: "pnl" });
  const data = await callRoute<Record<string, unknown>>(GET, ctx, "reports/tracking-category", params);
  return <TrackingReportPage initialData={data} />;
}
