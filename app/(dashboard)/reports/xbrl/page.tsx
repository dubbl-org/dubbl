import { getServerContext } from "@/lib/server/context";
import { callRoute } from "@/lib/server/call-route";
import { GET } from "@/app/api/v1/reports/xbrl/route";
import XbrlPage from "./xbrl-client";

export default async function Page() {
  const ctx = await getServerContext();
  const now = new Date();
  const query = new URLSearchParams({
    fiscalYearEnd: `${now.getFullYear() - 1}-12-31`,
  });
  const data = await callRoute<Record<string, unknown>>(GET, ctx, "reports/xbrl", query).catch(
    () => null
  );
  return <XbrlPage initialData={data} />;
}
