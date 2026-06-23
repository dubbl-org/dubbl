import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { journalEntry, journalLine } from "@/lib/db/schema";
import { eq, and, gte, lte } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError } from "@/lib/api/response";
import { requireRole } from "@/lib/api/require-role";
import { assertNotLocked } from "@/lib/api/period-lock";
import { logAudit } from "@/lib/api/audit";
import { z } from "zod";

/**
 * Bulk recode (reclassification) of journal lines.
 *
 * Selects journal lines matching a filter (date range / account / sourceType /
 * cost center / project) and repoints one dimension on each matching line to a
 * target value — moving spend between accounts, cost centers, or projects
 * without re-keying entries. Because every matching line moves by the same
 * amount on both sides, each entry stays balanced (no balancing journal needed).
 *
 * Only the line dimensions (accountId, costCenterId, projectId) are recodable;
 * journal lines carry no per-line tax rate, so tax reclassification isn't
 * available here (recode the account whose default tax rate you want instead).
 *
 * Honors the period lock per affected entry date and writes one audit record
 * per line changed, all inside a single transaction so the recode is atomic.
 */

const filterSchema = z
  .object({
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    accountId: z.string().optional(),
    sourceType: z.string().optional(),
    costCenterId: z.string().optional(),
    projectId: z.string().optional(),
  })
  .refine(
    (f) =>
      f.startDate ||
      f.endDate ||
      f.accountId ||
      f.sourceType ||
      f.costCenterId ||
      f.projectId,
    { message: "At least one filter is required to scope the recode" }
  );

const targetSchema = z
  .object({
    accountId: z.string().optional(),
    costCenterId: z.string().nullable().optional(),
    projectId: z.string().nullable().optional(),
  })
  .refine(
    (t) =>
      t.accountId !== undefined ||
      t.costCenterId !== undefined ||
      t.projectId !== undefined,
    { message: "A target dimension (accountId, costCenterId, or projectId) is required" }
  );

const recodeSchema = z.object({
  filter: filterSchema,
  target: targetSchema,
  // Defaults to draft-only so a bulk recode never silently overwrites the
  // account/cost-centre/project on already-posted, already-reported entries
  // (breaking ledger immutability with no reversing trail). Pass false to
  // deliberately include posted entries — that path is still audited per line.
  draftOnly: z.boolean().optional().default(true),
});

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "edit:entries");

    const body = await request.json();
    const { filter, target, draftOnly } = recodeSchema.parse(body);

    // Collect candidate lines (joined to their entry so we can scope by org,
    // date, source type, and status) before mutating anything.
    const conditions = [eq(journalEntry.organizationId, ctx.organizationId)];
    if (filter.startDate) conditions.push(gte(journalEntry.date, filter.startDate));
    if (filter.endDate) conditions.push(lte(journalEntry.date, filter.endDate));
    if (filter.sourceType) conditions.push(eq(journalEntry.sourceType, filter.sourceType));
    if (draftOnly) conditions.push(eq(journalEntry.status, "draft"));
    if (filter.accountId) conditions.push(eq(journalLine.accountId, filter.accountId));
    if (filter.costCenterId) conditions.push(eq(journalLine.costCenterId, filter.costCenterId));
    if (filter.projectId) conditions.push(eq(journalLine.projectId, filter.projectId));

    const rows = await db
      .select({
        lineId: journalLine.id,
        entryId: journalEntry.id,
        entryNumber: journalEntry.entryNumber,
        date: journalEntry.date,
        status: journalEntry.status,
        accountId: journalLine.accountId,
        costCenterId: journalLine.costCenterId,
        projectId: journalLine.projectId,
      })
      .from(journalLine)
      .innerJoin(journalEntry, eq(journalLine.journalEntryId, journalEntry.id))
      .where(and(...conditions));

    if (rows.length === 0) {
      return NextResponse.json({ recoded: 0, entriesAffected: 0, lines: [] });
    }

    // Pre-check the period lock for every distinct affected date, before any
    // write, so a single locked date aborts the whole recode cleanly.
    const dates = [...new Set(rows.map((r) => r.date))];
    for (const d of dates) {
      await assertNotLocked(ctx.organizationId, d);
    }

    // Build the patch from the requested target dimensions.
    const patch: {
      accountId?: string;
      costCenterId?: string | null;
      projectId?: string | null;
    } = {};
    if (target.accountId !== undefined) patch.accountId = target.accountId;
    if (target.costCenterId !== undefined) patch.costCenterId = target.costCenterId;
    if (target.projectId !== undefined) patch.projectId = target.projectId;

    // Only touch lines that actually change, so we don't churn audit noise.
    const toChange = rows.filter(
      (r) =>
        (patch.accountId !== undefined && patch.accountId !== r.accountId) ||
        (patch.costCenterId !== undefined && patch.costCenterId !== r.costCenterId) ||
        (patch.projectId !== undefined && patch.projectId !== r.projectId)
    );

    if (toChange.length === 0) {
      return NextResponse.json({ recoded: 0, entriesAffected: 0, lines: [] });
    }

    await db.transaction(async (tx) => {
      for (const r of toChange) {
        await tx
          .update(journalLine)
          .set(patch)
          .where(eq(journalLine.id, r.lineId));
      }
      // Touch each affected entry's updatedAt so downstream caches/reports see it.
      const entryIds = [...new Set(toChange.map((r) => r.entryId))];
      for (const entryId of entryIds) {
        await tx
          .update(journalEntry)
          .set({ updatedAt: new Date() })
          .where(eq(journalEntry.id, entryId));
      }
    });

    // Audit one record per changed line, capturing the before/after dimensions.
    for (const r of toChange) {
      const diff: Record<string, { from: unknown; to: unknown }> = {};
      if (patch.accountId !== undefined && patch.accountId !== r.accountId) {
        diff.accountId = { from: r.accountId, to: patch.accountId };
      }
      if (patch.costCenterId !== undefined && patch.costCenterId !== r.costCenterId) {
        diff.costCenterId = { from: r.costCenterId, to: patch.costCenterId };
      }
      if (patch.projectId !== undefined && patch.projectId !== r.projectId) {
        diff.projectId = { from: r.projectId, to: patch.projectId };
      }
      logAudit({
        ctx,
        action: "recode",
        entityType: "journal_line",
        entityId: r.lineId,
        changes: { entryId: r.entryId, entryNumber: r.entryNumber, diff },
        request,
      });
    }

    const entriesAffected = new Set(toChange.map((r) => r.entryId)).size;
    return NextResponse.json({
      recoded: toChange.length,
      entriesAffected,
      lines: toChange.map((r) => r.lineId),
    });
  } catch (err) {
    return handleError(err);
  }
}
