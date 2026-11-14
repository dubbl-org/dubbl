import { getServerContext } from "@/lib/server/context";
import { callRoute } from "@/lib/server/call-route";
import { GET } from "@/app/api/v1/reports/cash-flow-forecast/route";
import CashFlowForecastPage from "./cash-flow-forecast-client";

export default async function Page() {
  const ctx = await getServerContext();
  const now = new Date();
  const params = new URLSearchParams({ weeks: String((12)) });
  const data = await callRoute<Record<string, unknown>>(GET, ctx, "reports/cash-flow-forecast", params);
  return <CashFlowForecastPage initialData={data} />;
}
