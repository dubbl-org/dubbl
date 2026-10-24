import { getServerContext } from "@/lib/server/context";
import { callRoute } from "@/lib/server/call-route";
import { GET } from "@/app/api/v1/reports/pnl-comparison/route";
import PnlComparisonPage from "./pnl-comparison-client";

export default async function Page() {
  const ctx = await getServerContext();
  const now = new Date();
  const params = new URLSearchParams({ compare: String(("monthly")), periods: String(String((6))) });
  const data = await callRoute<Record<string, unknown>>(GET, ctx, "reports/pnl-comparison", params);
  return <PnlComparisonPage initialData={data} />;
}
