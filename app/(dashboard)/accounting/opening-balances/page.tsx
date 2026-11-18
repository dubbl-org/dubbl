import { getServerContext } from "@/lib/server/context";
import { callRoute } from "@/lib/server/call-route";
import { GET } from "@/app/api/v1/opening-balances/route";
import OpeningBalancesPage from "./opening-balances-client";

export default async function Page() {
  const ctx = await getServerContext();
  const now = new Date();
  const params = new URLSearchParams({  });
  const data = await callRoute<Record<string, unknown>>(GET, ctx, "opening-balances", params);
  return <OpeningBalancesPage initialData={data} />;
}
