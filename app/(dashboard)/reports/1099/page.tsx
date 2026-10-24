import { getServerContext } from "@/lib/server/context";
import { callRoute } from "@/lib/server/call-route";
import { GET } from "@/app/api/v1/reports/1099/route";
import Form1099Page from "./1099-client";

export default async function Page() {
  const ctx = await getServerContext();
  const now = new Date();
  const params = new URLSearchParams({ year: String(((new Date()).getFullYear() - 1)) });
  const data = await callRoute<Record<string, unknown>>(GET, ctx, "reports/1099", params);
  return <Form1099Page initialData={data} />;
}
