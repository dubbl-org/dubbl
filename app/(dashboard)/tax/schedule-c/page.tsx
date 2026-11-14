import { getServerContext } from "@/lib/server/context";
import { callRoute } from "@/lib/server/call-route";
import { GET } from "@/app/api/v1/reports/schedule-c/route";
import ScheduleCPage from "./schedule-c-client";

export default async function Page() {
  const ctx = await getServerContext();
  const now = new Date();
  const params = new URLSearchParams({ startDate: String(`${(new Date()).getFullYear()}-01-01`), endDate: String(`${(new Date()).getFullYear()}-12-31`) });
  const data = await callRoute<Record<string, unknown>>(GET, ctx, "reports/schedule-c", params);
  return <ScheduleCPage initialData={data} />;
}
