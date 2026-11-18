import { getServerContext } from "@/lib/server/context";
import { callRoute } from "@/lib/server/call-route";
import { GET } from "@/app/api/v1/reports/financial-ratios/route";
import FinancialRatiosPage from "./financial-ratios-client";

export default async function Page() {
  const ctx = await getServerContext();
  const now = new Date();
  const params = new URLSearchParams({ startDate: String(`${now.getFullYear()}-01-01`), endDate: String(now.toISOString().slice(0, 10)) });
  const data = await callRoute<Record<string, unknown>>(GET, ctx, "reports/financial-ratios", params);
  return <FinancialRatiosPage initialData={data} />;
}
