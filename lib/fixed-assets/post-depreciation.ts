import { db } from "@/lib/db";
import {
  fixedAsset,
  depreciationEntry,
  journalEntry,
  journalLine,
} from "@/lib/db/schema";
import { eq, and, sql, gte, lte } from "drizzle-orm";
import { getNextEntryNumber } from "@/lib/api/journal-automation";
import { assertNotLocked } from "@/lib/api/period-lock";
import type { AuthContext } from "@/lib/api/auth-context";
import { nextDepreciationCharge, monthBounds } from "./depreciation";

type FixedAssetRow = typeof fixedAsset.$inferSelect;

export type PostDepreciationResult =
  | {
      status: "posted";
      amount: number;
      depreciationEntry: typeof depreciationEntry.$inferSelect;
      journalEntryId: string | null;
      asset: { accumulatedDepreciation: number; netBookValue: number; status: "active" | "fully_depreciated" };
    }
  // One charge per calendar month: this month already has one.
  | { status: "already_this_month"; month: string }
  // Nothing left to charge (fully written down, or no usage reading for a
  // units-of-production asset).
  | { status: "nothing_due" };

/**
 * Book one month's depreciation for an active asset. This is the single path
 * behind the Record value drop button, the Run depreciation button, the nightly
 * job and the MCP tool, so they all charge the same amount:
 *
 * - at most one charge per calendar month (re-runs and double clicks are no-ops)
 * - the amount comes from nextDepreciationCharge (method, convention, rate)
 * - the date must not be in a locked period or closed financial year
 *   (assertNotLocked throws PeriodLockedError)
 * - posts DR depreciation expense / CR accumulated depreciation when both
 *   accounts are set, all in one transaction with the asset totals
 */
export async function postAssetDepreciation(
  asset: FixedAssetRow,
  opts: {
    date: string;
    unitsThisPeriod?: number | null;
    // The acting user; omitted for the nightly job (strict lock treatment).
    ctx?: AuthContext;
  }
): Promise<PostDepreciationResult> {
  const { start, end } = monthBounds(opts.date);

  const [thisMonth] = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(depreciationEntry)
    .where(
      and(
        eq(depreciationEntry.fixedAssetId, asset.id),
        gte(depreciationEntry.date, start),
        lte(depreciationEntry.date, end)
      )
    );
  if (Number(thisMonth?.count ?? 0) > 0) {
    return { status: "already_this_month", month: start.slice(0, 7) };
  }

  // periodIndex = number of depreciation entries already booked for the asset
  // (safe for declining-balance / SYD / uneven schedules).
  const [prior] = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(depreciationEntry)
    .where(eq(depreciationEntry.fixedAssetId, asset.id));
  const periodIndex = Number(prior?.count ?? 0);

  const amount = nextDepreciationCharge(asset, periodIndex, opts.date, opts.unitsThisPeriod);
  if (amount <= 0) return { status: "nothing_due" };

  await assertNotLocked(asset.organizationId, opts.date, opts.ctx);

  const accumulatedDepreciation = asset.accumulatedDepreciation + amount;
  // Step down from the current carrying amount, so a revalued asset keeps its
  // revalued base.
  const netBookValue = asset.netBookValue - amount;
  const status: "active" | "fully_depreciated" =
    netBookValue <= asset.residualValue ||
    accumulatedDepreciation >= asset.purchasePrice - asset.residualValue
      ? "fully_depreciated"
      : "active";

  return db.transaction(async (tx) => {
    let journalEntryId: string | null = null;

    if (asset.depreciationAccountId && asset.accumulatedDepAccountId) {
      const entryNumber = await getNextEntryNumber(asset.organizationId, tx);
      const [entry] = await tx
        .insert(journalEntry)
        .values({
          organizationId: asset.organizationId,
          entryNumber,
          date: opts.date,
          description: `Depreciation - ${asset.name} (${asset.assetNumber})`,
          reference: asset.assetNumber,
          status: "posted",
          sourceType: "depreciation",
          sourceId: asset.id,
          postedAt: new Date(),
          createdBy: opts.ctx?.userId ?? null,
        })
        .returning();
      journalEntryId = entry.id;

      await tx.insert(journalLine).values([
        {
          journalEntryId: entry.id,
          accountId: asset.depreciationAccountId,
          description: `Depreciation - ${asset.name}`,
          debitAmount: amount,
          creditAmount: 0,
        },
        {
          journalEntryId: entry.id,
          accountId: asset.accumulatedDepAccountId,
          description: `Accumulated depreciation - ${asset.name}`,
          debitAmount: 0,
          creditAmount: amount,
        },
      ]);
    }

    // Stamped with the period so the once-a-month guard recognises it.
    const [depEntry] = await tx
      .insert(depreciationEntry)
      .values({
        fixedAssetId: asset.id,
        date: opts.date,
        amount,
        unitsThisPeriod: opts.unitsThisPeriod ?? null,
        periodStart: start,
        periodEnd: end,
        journalEntryId,
      })
      .returning();

    await tx
      .update(fixedAsset)
      .set({ accumulatedDepreciation, netBookValue, status, updatedAt: new Date() })
      .where(eq(fixedAsset.id, asset.id));

    return {
      status: "posted" as const,
      amount,
      depreciationEntry: depEntry,
      journalEntryId,
      asset: { accumulatedDepreciation, netBookValue, status },
    };
  });
}
