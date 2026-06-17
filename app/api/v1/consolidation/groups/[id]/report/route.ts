import { db } from "@/lib/db";
import {
  consolidationGroup,
  consolidationEliminationEntry,
} from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError, ok, notFound } from "@/lib/api/response";
import { requireRole } from "@/lib/api/require-role";
import { notDeleted } from "@/lib/db/soft-delete";
import { computeConsolidatedReport } from "@/lib/api/consolidation-report";

// Load a consolidation group owned by the caller's org, with its members. Null
// when not found / not owned.
async function loadOwnedGroup(organizationId: string, groupId: string) {
  return db.query.consolidationGroup.findFirst({
    where: and(
      eq(consolidationGroup.id, groupId),
      eq(consolidationGroup.parentOrgId, organizationId),
      notDeleted(consolidationGroup.deletedAt)
    ),
    with: {
      members: { with: { organization: true } },
    },
  });
}

function resolveWindow(url: URL) {
  const startDate =
    url.searchParams.get("startDate") || `${new Date().getFullYear()}-01-01`;
  const endDate =
    url.searchParams.get("endDate") || new Date().toISOString().slice(0, 10);
  return { startDate, endDate };
}

/**
 * GET — read-only consolidated report. Safe and idempotent: it computes the
 * worksheet (translation + CTA-as-equity + capped eliminations) and returns it
 * WITHOUT writing to the database. The dashboard re-fetches this constantly, so
 * it must never have side effects. Use POST to persist elimination entries.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    const { startDate, endDate } = resolveWindow(new URL(request.url));

    const group = await loadOwnedGroup(ctx.organizationId, id);
    if (!group) return notFound("Consolidation group");

    const report = await computeConsolidatedReport(group, {
      startDate,
      endDate,
    });
    return ok(report);
  } catch (err) {
    return handleError(err);
  }
}

/**
 * POST — recalculate and PERSIST the period's elimination entries. This is the
 * explicit, side-effecting action (guarded by manage:reports). It computes the
 * same worksheet as GET, then idempotently upserts consolidationEliminationEntry
 * per (groupId, periodEndDate, ruleId): inside a transaction it clears the prior
 * rows for this period's rules and re-inserts the freshly computed amounts.
 * Returns the full report so callers don't need a second round trip.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:reports");
    const { startDate, endDate } = resolveWindow(new URL(request.url));

    const group = await loadOwnedGroup(ctx.organizationId, id);
    if (!group) return notFound("Consolidation group");

    const report = await computeConsolidatedReport(group, {
      startDate,
      endDate,
    });

    // Persist elimination entries idempotently for the period: clear prior rows
    // for these rules at this period end, then re-insert the freshly computed
    // amounts. Skipped (misconfigured) rules are excluded.
    const ruleEntries = report.elimination.entries.filter((r) => !r.skipped);
    if (ruleEntries.length > 0) {
      const ruleIds = ruleEntries.map((r) => r.ruleId);
      await db.transaction(async (tx) => {
        await tx
          .delete(consolidationEliminationEntry)
          .where(
            and(
              eq(consolidationEliminationEntry.groupId, group.id),
              eq(consolidationEliminationEntry.periodEndDate, endDate),
              inArray(consolidationEliminationEntry.ruleId, ruleIds)
            )
          );
        const rows = ruleEntries
          .filter((r) => r.eliminated !== 0 || r.variance !== 0)
          .map((r) => ({
            groupId: group.id,
            periodEndDate: endDate,
            ruleId: r.ruleId,
            currencyCode: report.presentationCurrency,
            amount: r.eliminated,
            varianceAmount: r.variance,
          }));
        if (rows.length > 0) {
          await tx.insert(consolidationEliminationEntry).values(rows);
        }
      });
    }

    return ok({ persisted: true, ...report });
  } catch (err) {
    return handleError(err);
  }
}
