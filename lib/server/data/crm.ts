import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { deal, pipeline } from "@/lib/db/schema";
import { notDeleted } from "@/lib/db/soft-delete";

/** Pipelines for the CRM board, mirroring GET /api/v1/crm/pipelines. */
export async function listPipelines(organizationId: string) {
  return db.query.pipeline.findMany({
    where: and(
      eq(pipeline.organizationId, organizationId),
      notDeleted(pipeline.deletedAt)
    ),
    orderBy: desc(pipeline.createdAt),
  });
}

/**
 * First board page for one pipeline, mirroring GET /api/v1/crm/deals including
 * the summary the pipeline bar renders (which always ignores filters).
 */
export async function dealsForPipeline(
  organizationId: string,
  pipelineId: string,
  limit = 24
) {
  const inPipeline = and(
    eq(deal.organizationId, organizationId),
    notDeleted(deal.deletedAt),
    eq(deal.pipelineId, pipelineId)
  );

  const rows = await db.query.deal.findMany({
    where: inPipeline,
    with: { contact: true, assignedUser: true },
    orderBy: desc(deal.createdAt),
    limit,
  });

  const [totalRow] = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(deal)
    .where(inPipeline);

  const allDeals = await db.query.deal.findMany({ where: inPipeline });
  const activeDeals = allDeals.filter((d) => !d.wonAt && !d.lostAt);
  const stageDistribution: Record<string, { count: number; value: number }> = {};
  for (const d of activeDeals) {
    if (!stageDistribution[d.stageId]) stageDistribution[d.stageId] = { count: 0, value: 0 };
    stageDistribution[d.stageId].count++;
    stageDistribution[d.stageId].value += d.valueCents;
  }

  return {
    deals: rows,
    total: Number(totalRow?.count ?? 0),
    summary: {
      activeCount: activeDeals.length,
      activeValue: activeDeals.reduce((s, d) => s + d.valueCents, 0),
      wonCount: allDeals.filter((d) => d.wonAt).length,
      wonValue: allDeals.filter((d) => d.wonAt).reduce((s, d) => s + d.valueCents, 0),
      totalDeals: allDeals.length,
      stageDistribution,
    },
  };
}
