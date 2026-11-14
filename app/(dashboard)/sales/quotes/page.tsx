import { getServerContext } from "@/lib/server/context";
import { callRoute } from "@/lib/server/call-route";
import { GET } from "@/app/api/v1/quotes/route";
import QuotesPage from "./quotes-client";

export default async function Page() {
  const ctx = await getServerContext();
  const now = new Date();
  const params = new URLSearchParams({ status: String(("all")) });
  const data = await callRoute<Record<string, unknown>>(GET, ctx, "quotes", params);
  return <QuotesPage initialData={data} />;
}
