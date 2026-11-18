import { getServerContext } from "@/lib/server/context";
import { callRoute } from "@/lib/server/call-route";
import { GET } from "@/app/api/v1/reports/trial-balance/route";
import TrialBalancePage from "./trial-balance-client";

export default async function Page() {
  const ctx = await getServerContext();
  const now = new Date();
  const params = new URLSearchParams({ asAt: String((new Date().toISOString().slice(0, 10))) });
  const data = await callRoute<Record<string, unknown>>(GET, ctx, "reports/trial-balance", params);
  return <TrialBalancePage initialData={data} />;
}
