import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fixedAsset, depreciationEntry, journalEntry } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { logAudit } from "@/lib/api/audit";

// Roll back (undo) the most recently booked depreciation period for an asset.
// Voids the linked journal entry, removes the depreciation entry, decrements the
// asset's accumulated depreciation, restores its net book value, and reactivates
// it if the rolled-back period had pushed it to fully_depreciated.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:assets");

    const asset = await db.query.fixedAsset.findFirst({
      where: and(
        eq(fixedAsset.id, id),
        eq(fixedAsset.organizationId, ctx.organizationId),
        notDeleted(fixedAsset.deletedAt)
      ),
    });

    if (!asset) return notFound("Fixed asset");

    if (asset.status === "disposed") {
      return NextResponse.json(
        { error: "Cannot roll back depreciation on a disposed asset" },
        { status: 400 }
      );
    }

    // Most recent depreciation period for this asset: order by date, then
    // creation time, so the latest-booked entry is undone first (mirrors the
    // count-based periodIndex used when booking).
    const lastEntry = await db.query.depreciationEntry.findFirst({
      where: eq(depreciationEntry.fixedAssetId, asset.id),
      orderBy: [desc(depreciationEntry.date), desc(depreciationEntry.createdAt)],
    });

    if (!lastEntry) {
      return NextResponse.json(
        { error: "No depreciation entries to roll back" },
        { status: 400 }
      );
    }

    const result = await db.transaction(async (tx) => {
      // Void the linked journal entry (if any and not already voided) so the GL
      // reverses out the depreciation charge.
      if (lastEntry.journalEntryId) {
        const linked = await tx.query.journalEntry.findFirst({
          where: and(
            eq(journalEntry.id, lastEntry.journalEntryId),
            eq(journalEntry.organizationId, ctx.organizationId)
          ),
        });
        if (linked && linked.status !== "void") {
          await tx
            .update(journalEntry)
            .set({
              status: "void",
              voidedAt: new Date(),
              voidReason: `Depreciation rollback - ${asset.name} (${asset.assetNumber})`,
              updatedAt: new Date(),
            })
            .where(eq(journalEntry.id, lastEntry.journalEntryId));
        }
      }

      // Remove the depreciation entry so the count-based periodIndex stays
      // accurate for any subsequent re-depreciation.
      await tx
        .delete(depreciationEntry)
        .where(eq(depreciationEntry.id, lastEntry.id));

      // Reverse the asset totals: clamp accumulated at 0 to stay defensive
      // against any stale data.
      const newAccumulated = Math.max(
        0,
        asset.accumulatedDepreciation - lastEntry.amount
      );
      const newNetBookValue = asset.purchasePrice - newAccumulated;
      // If the rolled-back period had fully depreciated the asset, bring it back
      // to active. Leave any other status (e.g. in_progress) untouched.
      const newStatus =
        asset.status === "fully_depreciated" ? "active" : asset.status;

      const [row] = await tx
        .update(fixedAsset)
        .set({
          accumulatedDepreciation: newAccumulated,
          netBookValue: newNetBookValue,
          status: newStatus,
          updatedAt: new Date(),
        })
        .where(eq(fixedAsset.id, id))
        .returning();

      return {
        asset: row,
        rolledBack: lastEntry,
        voidedJournalEntryId: lastEntry.journalEntryId ?? null,
      };
    });

    logAudit({
      ctx,
      action: "rollback_depreciation",
      entityType: "fixed_asset",
      entityId: id,
      changes: {
        previousStatus: asset.status,
        amount: lastEntry.amount,
        depreciationEntryId: lastEntry.id,
        voidedJournalEntryId: lastEntry.journalEntryId ?? null,
      },
      request,
    });

    return NextResponse.json({
      asset: {
        accumulatedDepreciation: result.asset.accumulatedDepreciation,
        netBookValue: result.asset.netBookValue,
        status: result.asset.status,
      },
      rolledBack: {
        id: result.rolledBack.id,
        date: result.rolledBack.date,
        amount: result.rolledBack.amount,
      },
      voidedJournalEntryId: result.voidedJournalEntryId,
    });
  } catch (err) {
    return handleError(err);
  }
}
