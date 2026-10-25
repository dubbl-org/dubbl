import { getServerContext } from "@/lib/server/context";
import { callRoute } from "@/lib/server/call-route";
import { GET } from "@/app/api/v1/reports/tax-return/route";
import TaxReturnPage from "./return-client";

/**
 * One page for every return kind in the org's jurisdiction. `kind` comes from
 * the module list (app/api/v1/tax/returns), so a new country adds pages without
 * adding a route.
 */
export default async function Page({ params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  const ctx = await getServerContext();
  const now = new Date();
  const query = new URLSearchParams({
    kind,
    startDate: `${now.getFullYear()}-01-01`,
    endDate: now.toISOString().slice(0, 10),
    basis: "accrual",
  });
  const data = await callRoute<Record<string, unknown>>(GET, ctx, "reports/tax-return", query);
  return <TaxReturnPage initialData={data} kind={kind} />;
}
