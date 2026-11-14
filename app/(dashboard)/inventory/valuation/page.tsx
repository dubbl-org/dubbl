import { getServerContext } from "@/lib/server/context";
import { callRoute } from "@/lib/server/call-route";
import { GET } from "@/app/api/v1/reports/inventory-valuation/route";
import InventoryValuationPage from "./valuation-client";

export default async function Page() {
  const ctx = await getServerContext();
  const now = new Date();
  const params = new URLSearchParams({  });
  const data = await callRoute<Record<string, unknown>>(GET, ctx, "reports/inventory-valuation", params);
  return <InventoryValuationPage initialData={data} />;
}
