import { db } from "@/lib/db";
import { deal, member, pipeline } from "@/lib/db/schema";
import { and, eq, ne } from "drizzle-orm";
import { notDeleted, softDelete } from "@/lib/db/soft-delete";
import { AuthError, type AuthContext } from "@/lib/api/auth-context";
import {
  dealStageChange,
  isClosedStage,
  lostReasonBreakdown,
  normalizePipelineStages,
  remapStage,
  stageDisplayName,
  type StageLike,
} from "@/lib/crm/rules";

type DbOrTx = typeof db | Parameters<Parameters<(typeof db)["transaction"]>[0]>[0];

/** CRM errors keep their message and status through handleError (REST) and wrapTool (MCP). */
export class CrmError extends AuthError {}

/** Permission that guards changing deals, activities and pipelines. */
export const CRM_PERMISSION = "manage:contacts";

export type DealRecord = typeof deal.$inferSelect;

export async function findDeal(ctx: AuthContext, dealId: string): Promise<DealRecord> {
  const found = await db.query.deal.findFirst({
    where: and(eq(deal.id, dealId), eq(deal.organizationId, ctx.organizationId), notDeleted(deal.deletedAt)),
  });
  if (!found) throw new CrmError("Deal not found", 404);
  return found;
}

/** The org's live pipeline, or a 404/400. */
export async function findPipeline(ctx: AuthContext, pipelineId: string, exec: DbOrTx = db) {
  const found = await exec.query.pipeline.findFirst({
    where: and(eq(pipeline.id, pipelineId), eq(pipeline.organizationId, ctx.organizationId), notDeleted(pipeline.deletedAt)),
  });
  if (!found) throw new CrmError("Pipeline not found", 404);
  return found;
}

function stagesOf(p: { stages: unknown }): StageLike[] {
  return Array.isArray(p.stages) ? (p.stages as StageLike[]) : [];
}

/** Throws unless `stageId` is a stage of the pipeline (won and lost always are). */
export function assertStageInPipeline(p: { name: string; stages: unknown }, stageId: string) {
  if (isClosedStage(stageId)) return;
  if (!stagesOf(p).some((s) => s.id === stageId)) {
    throw new CrmError(`Stage "${stageId}" isn't in the "${p.name}" pipeline`, 400);
  }
}

/** Owners must be people in this organization. */
export async function assertOrgUser(ctx: AuthContext, userId: string | null | undefined) {
  if (!userId) return;
  const found = await db.query.member.findFirst({
    where: and(eq(member.userId, userId), eq(member.organizationId, ctx.organizationId)),
    columns: { id: true },
  });
  if (!found) throw new CrmError("The owner must be a member of this organization", 400);
}

/**
 * Move a deal to a stage, closing or reopening it as needed (see
 * dealStageChange). Used by the stage, won and lost routes and the MCP tools,
 * so a deal is "won" however it reaches the Won stage.
 */
export async function moveDealToStage(
  ctx: AuthContext,
  dealId: string,
  stageId: string,
  opts: { reason?: string | null } = {}
): Promise<{ before: DealRecord; deal: DealRecord }> {
  const before = await findDeal(ctx, dealId);
  if (!isClosedStage(stageId)) {
    const p = await findPipeline(ctx, before.pipelineId);
    assertStageInPipeline(p, stageId);
  }
  const patch = dealStageChange(before, stageId, { reason: opts.reason });
  const [updated] = await db
    .update(deal)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(deal.id, dealId), eq(deal.organizationId, ctx.organizationId), notDeleted(deal.deletedAt)))
    .returning();
  if (!updated) throw new CrmError("Deal not found", 404);
  return { before, deal: updated };
}

/** Clear the default flag on every other pipeline so there is only one default. */
export async function clearOtherDefaults(exec: DbOrTx, organizationId: string, keepId: string) {
  await exec
    .update(pipeline)
    .set({ isDefault: false })
    .where(and(eq(pipeline.organizationId, organizationId), ne(pipeline.id, keepId), eq(pipeline.isDefault, true)));
}

/**
 * Save a pipeline's stages. Won and Lost are always kept (see
 * normalizePipelineStages), and deals sitting in a removed stage move to the
 * pipeline's first open stage so they never disappear from the board.
 */
export async function applyPipelineStages(
  exec: DbOrTx,
  organizationId: string,
  pipelineId: string,
  stages: StageLike[]
): Promise<{ stages: StageLike[]; movedDeals: number }> {
  const normalized = normalizePipelineStages(stages);
  const deals = await exec
    .select({ id: deal.id, stageId: deal.stageId })
    .from(deal)
    .where(and(eq(deal.organizationId, organizationId), eq(deal.pipelineId, pipelineId), notDeleted(deal.deletedAt)));
  let movedDeals = 0;
  for (const d of deals) {
    const next = remapStage(d.stageId, normalized);
    if (next !== d.stageId) {
      await exec.update(deal).set({ stageId: next, updatedAt: new Date() }).where(eq(deal.id, d.id));
      movedDeals++;
    }
  }
  return { stages: normalized, movedDeals };
}

/**
 * Delete (soft) a pipeline without losing its deals: they move to the default
 * pipeline (or the oldest other one), open deals into a stage that exists
 * there. If it was the default, the pipeline they move to becomes the default.
 * Refuses when it is the only pipeline and still has deals.
 */
export async function deletePipelineMovingDeals(ctx: AuthContext, pipelineId: string) {
  return db.transaction(async (tx) => {
    const p = await findPipeline(ctx, pipelineId, tx);
    const deals = await tx
      .select({ id: deal.id, stageId: deal.stageId })
      .from(deal)
      .where(and(eq(deal.organizationId, ctx.organizationId), eq(deal.pipelineId, pipelineId), notDeleted(deal.deletedAt)));

    const others = await tx.query.pipeline.findMany({
      where: and(eq(pipeline.organizationId, ctx.organizationId), ne(pipeline.id, pipelineId), notDeleted(pipeline.deletedAt)),
      orderBy: pipeline.createdAt,
    });
    const target = others.find((o) => o.isDefault) ?? others[0] ?? null;

    if (deals.length > 0 && !target) {
      throw new CrmError(
        `This is your only pipeline and it has ${deals.length} deal${deals.length === 1 ? "" : "s"}. Create another pipeline first, or delete the deals.`,
        409
      );
    }

    if (target) {
      const targetStages = stagesOf(target);
      for (const d of deals) {
        await tx
          .update(deal)
          .set({ pipelineId: target.id, stageId: remapStage(d.stageId, targetStages), updatedAt: new Date() })
          .where(eq(deal.id, d.id));
      }
      if (p.isDefault && !target.isDefault) {
        await tx.update(pipeline).set({ isDefault: true }).where(eq(pipeline.id, target.id));
      }
    }

    const [deleted] = await tx
      .update(pipeline)
      .set({ ...softDelete(), isDefault: false })
      .where(and(eq(pipeline.id, pipelineId), eq(pipeline.organizationId, ctx.organizationId)))
      .returning();

    return { pipeline: deleted, movedDeals: deals.length, movedTo: target ? { id: target.id, name: target.name } : null };
  });
}

/**
 * CRM analytics for the org: deal counts, open pipeline value, won value,
 * win rate (won / decided), average won deal, the stage distribution (with
 * stage names) and lost reasons. Money in integer cents.
 */
export async function computeCrmAnalytics(ctx: AuthContext) {
  const deals = await db.query.deal.findMany({
    where: and(
      eq(deal.organizationId, ctx.organizationId),
      notDeleted(deal.deletedAt)
    ),
  });

  const totalDeals = deals.length;
  const openDeals = deals.filter((d) => !d.wonAt && !d.lostAt).length;
  const wonDeals = deals.filter((d) => d.wonAt).length;
  const lostDeals = deals.filter((d) => d.lostAt).length;
  const totalPipelineValue = deals
    .filter((d) => !d.wonAt && !d.lostAt)
    .reduce((sum, d) => sum + d.valueCents, 0);
  const wonValue = deals
    .filter((d) => d.wonAt)
    .reduce((sum, d) => sum + d.valueCents, 0);
  const conversionRate =
    wonDeals + lostDeals > 0
      ? Math.round((wonDeals / (wonDeals + lostDeals)) * 100)
      : 0;
  const avgDealValue =
    wonDeals > 0 ? Math.round(wonValue / wonDeals) : 0;

  const pipelines = await db.query.pipeline.findMany({
    where: eq(pipeline.organizationId, ctx.organizationId),
    columns: { id: true, stages: true },
  });
  const pipelineStages = pipelines.map((p) => ({ id: p.id, stages: (p.stages ?? []) as StageLike[] }));

  // Stage distribution, keyed by stage id, with the stage's display name.
  const stageMap: Record<string, { name: string; count: number; value: number }> = {};
  for (const d of deals) {
    if (!stageMap[d.stageId]) {
      stageMap[d.stageId] = { name: stageDisplayName(pipelineStages, d.pipelineId, d.stageId), count: 0, value: 0 };
    }
    stageMap[d.stageId].count++;
    stageMap[d.stageId].value += d.valueCents;
  }

  // Why deals were lost, most common first.
  const lostReasons = lostReasonBreakdown(deals);

  return {
    totalDeals,
    openDeals,
    wonDeals,
    lostDeals,
    totalPipelineValue,
    wonValue,
    conversionRate,
    avgDealValue,
    stageDistribution: stageMap,
    lostReasons,
  };
}
