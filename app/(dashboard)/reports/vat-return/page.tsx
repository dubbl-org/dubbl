import { getServerContext } from "@/lib/server/context";
import { callRoute } from "@/lib/server/call-route";
import { GET } from "@/app/api/v1/reports/vat-return/route";
import VatReturnPage from "./vat-return-client";

export default async function Page() {
  const ctx = await getServerContext();
  const now = new Date();
  const params = new URLSearchParams({ startDate: String(`${(new Date()).getFullYear()}-01-01`), endDate: String((new Date()).toISOString().slice(0, 10)), basis: String("accrual") });
  const data = await callRoute<Record<string, unknown>>(GET, ctx, "reports/vat-return", params);
  return <VatReturnPage initialData={data} />;
}
