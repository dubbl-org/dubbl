import { getServerContext } from "@/lib/server/context";
import { callRoute } from "@/lib/server/call-route";
import { GET as getSchedules } from "@/app/api/v1/report-schedules/route";
import { GET as getSaved } from "@/app/api/v1/reports/saved/route";
import ReportSchedulesPage from "./schedules-client";

/** Both lists this screen shows are fetched before the first paint. */
export default async function Page() {
  const ctx = await getServerContext();
  const [schedules, saved] = await Promise.all([
    callRoute<{ data?: never[] }>(getSchedules, ctx, "report-schedules", new URLSearchParams({ limit: "200" })),
    callRoute<{ reports?: never[] }>(getSaved, ctx, "reports/saved"),
  ]);

  return (
    <ReportSchedulesPage
      initialSchedules={schedules?.data ?? []}
      initialSavedReports={saved?.reports ?? []}
    />
  );
}
