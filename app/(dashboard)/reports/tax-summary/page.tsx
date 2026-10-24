import { getServerContext } from "@/lib/server/context";
import { callRoute } from "@/lib/server/call-route";
import { GET } from "@/app/api/v1/reports/tax-summary/route";
import TaxSummaryPage from "./tax-summary-client";

/** The date window follows ?startDate/&endDate, which the drill-down links set. */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ startDate?: string; endDate?: string }>;
}) {
  const ctx = await getServerContext();
  const sp = await searchParams;
  const now = new Date();
  const params = new URLSearchParams({
    startDate: sp.startDate || `${now.getFullYear()}-01-01`,
    endDate: sp.endDate || now.toISOString().slice(0, 10),
  });
  const data = await callRoute<Record<string, unknown>>(GET, ctx, "reports/tax-summary", params);
  return <TaxSummaryPage initialData={data} />;
}
