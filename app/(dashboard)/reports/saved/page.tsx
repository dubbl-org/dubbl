import { getServerContext } from "@/lib/server/context";
import { callRoute } from "@/lib/server/call-route";
import { GET as getSaved } from "@/app/api/v1/reports/saved/route";
import { GET as getSchedules } from "@/app/api/v1/report-schedules/route";
import SavedReportsPage from "./saved-client";

interface Schedule {
  savedReportId?: string | null;
  lastRunAt?: string | null;
}

/** Saved reports plus when each was last delivered, which the list shows. */
export default async function Page() {
  const ctx = await getServerContext();
  const [saved, schedules] = await Promise.all([
    callRoute<{ reports?: never[] }>(getSaved, ctx, "reports/saved"),
    callRoute<{ data?: Schedule[] }>(getSchedules, ctx, "report-schedules",
      new URLSearchParams({ limit: "200" })),
  ]);

  const lastRun: Record<string, string | null> = {};
  for (const s of schedules?.data ?? []) {
    if (!s.savedReportId || !s.lastRunAt) continue;
    const existing = lastRun[s.savedReportId];
    if (!existing || new Date(s.lastRunAt) > new Date(existing)) {
      lastRun[s.savedReportId] = s.lastRunAt;
    }
  }

  return <SavedReportsPage initialReports={saved?.reports ?? []} initialLastRun={lastRun} />;
}
