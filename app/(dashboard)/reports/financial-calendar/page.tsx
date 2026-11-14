import { getServerContext } from "@/lib/server/context";
import { callRoute } from "@/lib/server/call-route";
import { GET } from "@/app/api/v1/reports/financial-calendar/route";
import FinancialCalendarPage from "./financial-calendar-client";

/** Opens on the current month, matching the client's first window. */
export default async function Page() {
  const ctx = await getServerContext();
  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .slice(0, 10);
  const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    .toISOString()
    .slice(0, 10);
  const data = await callRoute<Record<string, unknown>>(GET, ctx, "reports/financial-calendar",
    new URLSearchParams({ startDate, endDate }));
  return <FinancialCalendarPage initialData={data} />;
}
