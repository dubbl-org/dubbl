import { getServerContext } from "@/lib/server/context";
import { callRoute } from "@/lib/server/call-route";
import { GET } from "@/app/api/v1/reports/income-statement/route";
import IncomeStatementPage from "./income-statement-client";

export default async function Page() {
  const ctx = await getServerContext();
  const now = new Date();
  // Same window the page opens on: this year, up to today.
  const year = now.getFullYear();
  const params = new URLSearchParams({
    from: `${year}-01-01`,
    to: now.toISOString().slice(0, 10),
  });
  const data = await callRoute<Record<string, unknown>>(GET, ctx, "reports/income-statement", params);
  return <IncomeStatementPage initialData={data} />;
}
