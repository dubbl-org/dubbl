import { getServerContext } from "@/lib/server/context";
import { callRoute } from "@/lib/server/call-route";
import { GET } from "@/app/api/v1/reports/general-ledger/route";
import GeneralLedgerPage, { type GLPayload } from "./general-ledger-client";

/** The window and any dimension filter arrive in the query, as they do for the client. */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await getServerContext();
  const sp = await searchParams;
  const now = new Date();
  const pick = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);

  const params = new URLSearchParams({
    startDate: pick("startDate") ?? `${now.getFullYear()}-01-01`,
    endDate: pick("endDate") ?? now.toISOString().slice(0, 10),
  });
  const costCenterId = pick("costCenterId");
  const projectId = pick("projectId");
  if (costCenterId !== undefined) params.set("costCenterId", costCenterId);
  else if (projectId !== undefined) params.set("projectId", projectId);

  const data = await callRoute<GLPayload>(GET, ctx, "reports/general-ledger", params);
  return <GeneralLedgerPage initialData={data} />;
}
