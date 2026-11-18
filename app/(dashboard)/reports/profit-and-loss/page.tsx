import { getServerContext } from "@/lib/server/context";
import { callRoute } from "@/lib/server/call-route";
import { GET } from "@/app/api/v1/reports/profit-and-loss/route";
import ProfitAndLossPage, { type PLInitialData } from "./profit-and-loss-client";

export default async function Page() {
  const ctx = await getServerContext();
  const now = new Date();
  const params = new URLSearchParams({
    startDate: `${now.getFullYear()}-01-01`,
    endDate: now.toISOString().slice(0, 10),
    basis: "accrual",
  });
  const data = await callRoute<PLInitialData>(GET, ctx, "reports/profit-and-loss", params);
  return <ProfitAndLossPage initialData={data} />;
}
