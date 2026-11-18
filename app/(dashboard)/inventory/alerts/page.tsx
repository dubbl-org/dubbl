import { getServerContext } from "@/lib/server/context";
import { callRoute } from "@/lib/server/call-route";
import { GET } from "@/app/api/v1/inventory/reorder-suggestions/route";
import AlertsPage from "./alerts-client";

export default async function Page() {
  const ctx = await getServerContext();
  const now = new Date();
  const params = new URLSearchParams({  });
  const data = await callRoute<Record<string, unknown>>(GET, ctx, "inventory/reorder-suggestions", params);
  return <AlertsPage initialData={data} />;
}
