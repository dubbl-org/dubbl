import { getServerContext } from "@/lib/server/context";
import { callRoute } from "@/lib/server/call-route";
import { GET as getSaved } from "@/app/api/v1/reports/saved/route";
import CustomReportsPage from "./custom-client";

/** The builder's starting list of saved reports. */
export default async function Page() {
  const ctx = await getServerContext();
  const saved = await callRoute<{ reports?: never[] }>(getSaved, ctx, "reports/saved");
  return <CustomReportsPage initialReports={saved?.reports ?? []} />;
}
