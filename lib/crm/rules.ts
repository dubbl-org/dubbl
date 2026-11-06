// Pure CRM rules shared by the deal API routes, the MCP tools and the CRM
// pages. No database access here, so it can be unit tested and used anywhere.

/** Stage ids a deal moves to when it is won or lost. */
export const WON_STAGE = "closed_won";
export const LOST_STAGE = "closed_lost";

export interface StageLike {
  id: string;
  name: string;
  color: string;
}

export function isClosedStage(stageId: string): boolean {
  return stageId === WON_STAGE || stageId === LOST_STAGE;
}

interface DealState {
  stageId: string;
  wonAt: Date | null;
  lostAt: Date | null;
  probability: number | null;
}

export interface DealStagePatch {
  stageId: string;
  wonAt: Date | null;
  lostAt: Date | null;
  lostReason?: string | null;
  probability?: number | null;
}

/**
 * The fields to write when a deal moves to `targetStageId`, however it got
 * there (board drag, stage click, Mark won / Mark lost, API, MCP):
 * - Won: wonAt is set, probability 100, any lost state is cleared.
 * - Lost: lostAt and the reason are set, probability 0, any won state is cleared.
 * - An open stage: the deal is open. Moving a closed deal back reopens it and
 *   clears its outcome; its probability is cleared too since 100 or 0 no longer
 *   applies. Moving between open stages only changes the stage.
 */
export function dealStageChange(
  current: DealState,
  targetStageId: string,
  opts: { reason?: string | null; now?: Date } = {}
): DealStagePatch {
  const now = opts.now ?? new Date();
  if (targetStageId === WON_STAGE) {
    return { stageId: WON_STAGE, wonAt: current.wonAt ?? now, lostAt: null, lostReason: null, probability: 100 };
  }
  if (targetStageId === LOST_STAGE) {
    const reason = opts.reason?.trim();
    return { stageId: LOST_STAGE, wonAt: null, lostAt: current.lostAt ?? now, lostReason: reason ? reason : null, probability: 0 };
  }
  const wasClosed = !!current.wonAt || !!current.lostAt || isClosedStage(current.stageId);
  if (wasClosed) {
    return { stageId: targetStageId, wonAt: null, lostAt: null, lostReason: null, probability: null };
  }
  return { stageId: targetStageId, wonAt: null, lostAt: null };
}

/**
 * Every pipeline keeps a Won and a Lost stage (they are how deals close), at
 * the end. Missing ones are added back with their default names; their names
 * and colours can still be changed.
 */
export function normalizePipelineStages<T extends StageLike>(stages: T[]): StageLike[] {
  const open = stages.filter((s) => !isClosedStage(s.id));
  const won = stages.find((s) => s.id === WON_STAGE) ?? { id: WON_STAGE, name: "Won", color: "#10b981" };
  const lost = stages.find((s) => s.id === LOST_STAGE) ?? { id: LOST_STAGE, name: "Lost", color: "#ef4444" };
  return [...open, won, lost].map((s) => ({ id: s.id, name: s.name, color: s.color }));
}

/**
 * Where a deal lands when its stage disappears (stage removed, or the deal
 * moves to another pipeline): won and lost stay put, an open stage that also
 * exists in `stages` is kept, anything else goes to the first open stage.
 */
export function remapStage(stageId: string, stages: StageLike[]): string {
  if (isClosedStage(stageId)) return stageId;
  const open = stages.filter((s) => !isClosedStage(s.id));
  if (open.some((s) => s.id === stageId)) return stageId;
  return open[0]?.id ?? stageId;
}

/** Display name of a stage, looking in the deal's own pipeline first. */
export function stageDisplayName(
  pipelines: { id: string; stages: StageLike[] }[],
  pipelineId: string | null | undefined,
  stageId: string
): string {
  const own = pipelines.find((p) => p.id === pipelineId)?.stages.find((s) => s.id === stageId);
  if (own) return own.name;
  for (const p of pipelines) {
    const hit = p.stages.find((s) => s.id === stageId);
    if (hit) return hit.name;
  }
  if (stageId === WON_STAGE) return "Won";
  if (stageId === LOST_STAGE) return "Lost";
  return stageId.replace(/_/g, " ");
}

export const NO_LOST_REASON = "No reason given";

/**
 * Lost deals grouped by reason (case and spacing ignored), most common first.
 * value is the summed deal value in cents.
 */
export function lostReasonBreakdown(
  deals: { lostAt: Date | string | null; lostReason: string | null; valueCents: number }[]
): { reason: string; count: number; value: number }[] {
  const groups = new Map<string, { reason: string; count: number; value: number }>();
  for (const d of deals) {
    if (!d.lostAt) continue;
    const raw = d.lostReason?.trim().replace(/\s+/g, " ") || "";
    const key = raw.toLowerCase() || "\u0000none";
    const g = groups.get(key) ?? { reason: raw || NO_LOST_REASON, count: 0, value: 0 };
    g.count += 1;
    g.value += d.valueCents;
    groups.set(key, g);
  }
  return [...groups.values()].sort((a, b) => b.count - a.count || b.value - a.value || a.reason.localeCompare(b.reason));
}
