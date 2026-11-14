import { getServerContext } from "@/lib/server/context";
import { listPipelines, dealsForPipeline } from "@/lib/server/data/crm";
import { toClient } from "@/lib/server/data/serialize";
import CrmPage, { type Pipeline, type Deal, type Summary } from "./crm-client";

export default async function Page() {
  const ctx = await getServerContext();
  const pipelines = await listPipelines(ctx.organizationId);
  const active = pipelines.find((p) => p.isDefault) ?? pipelines[0] ?? null;
  const board = active
    ? await dealsForPipeline(ctx.organizationId, active.id)
    : { deals: [], total: 0, summary: { activeCount: 0, activeValue: 0, wonCount: 0, wonValue: 0, totalDeals: 0, stageDistribution: {} } };
  return (
    <CrmPage
      initialPipelines={toClient<Pipeline[]>(pipelines)}
      initialDeals={toClient<Deal[]>(board.deals)}
      initialSummary={board.summary as Summary}
      initialTotal={board.total}
    />
  );
}
