import { getServerContext } from "@/lib/server/context";
import { callRoute } from "@/lib/server/call-route";
import { GET } from "@/app/api/v1/payroll/reports/summary/route";
import ReportsPage from "./reports-client";

export default async function Page() {
  const ctx = await getServerContext();
  const now = new Date();
  const params = new URLSearchParams({  });
  const data = await callRoute<Record<string, unknown>>(GET, ctx, "payroll/reports/summary", params);
  return <ReportsPage initialData={data} />;
}
