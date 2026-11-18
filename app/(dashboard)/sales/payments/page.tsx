import { getServerContext } from "@/lib/server/context";
import { callRoute } from "@/lib/server/call-route";
import { GET } from "@/app/api/v1/payments/route";
import PaymentsPage from "./payments-client";

export default async function Page() {
  const ctx = await getServerContext();
  const now = new Date();
  const params = new URLSearchParams({ type: 'received' });
  const data = await callRoute<Record<string, unknown>>(GET, ctx, "payments", params);
  return <PaymentsPage initialData={data} />;
}
