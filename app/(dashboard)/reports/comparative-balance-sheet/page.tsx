import { getServerContext } from "@/lib/server/context";
import { callRoute } from "@/lib/server/call-route";
import { GET } from "@/app/api/v1/reports/balance-sheet/route";
import ComparativeBalanceSheetPage from "./comparative-balance-sheet-client";

/** Opens on the current month end, which is the first column the client asks for. */
export default async function Page() {
  const ctx = await getServerContext();
  const now = new Date();
  const asOf = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    .toISOString()
    .slice(0, 10);
  const data = await callRoute<Record<string, unknown>>(GET, ctx, "reports/balance-sheet",
    new URLSearchParams({ asOf }));
  return <ComparativeBalanceSheetPage initialData={data} />;
}
