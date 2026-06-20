import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  fixedAsset,
  depreciationEntry,
  journalEntry,
  journalLine,
} from "@/lib/db/schema";
import { eq, and, sql, gte, lte } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { calculateMonthlyDepreciation } from "@/lib/fixed-assets/depreciation";

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:assets");

    // Get all active assets for this organization
    const assets = await db.query.fixedAsset.findMany({
      where: and(
        eq(fixedAsset.organizationId, ctx.organizationId),
        eq(fixedAsset.status, "active"),
        notDeleted(fixedAsset.deletedAt)
      ),
    });

    if (assets.length === 0) {
      return NextResponse.json({
        message: "No active assets to depreciate",
        processed: 0,
      });
    }

    const today = new Date().toISOString().split("T")[0];
    // Current calendar month — the period this run depreciates. Used to make the
    // run idempotent: an asset already depreciated this month is skipped, so
    // running it twice (or double-clicking) never double-books the charge.
    const [y, m] = today.split("-");
    const monthStart = `${y}-${m}-01`;
    const lastDay = new Date(Number(y), Number(m), 0).getDate();
    const monthEnd = `${y}-${m}-${String(lastDay).padStart(2, "0")}`;

    const results: { assetId: string; assetNumber: string; amount: number }[] =
      [];
    let skipped = 0;

    for (const asset of assets) {
      // Already depreciated this month? Skip (idempotency).
      const [thisPeriod] = await db
        .select({ count: sql<number>`count(*)` })
        .from(depreciationEntry)
        .where(
          and(
            eq(depreciationEntry.fixedAssetId, asset.id),
            gte(depreciationEntry.date, monthStart),
            lte(depreciationEntry.date, monthEnd)
          )
        );
      if (Number(thisPeriod?.count ?? 0) > 0) {
        skipped++;
        continue;
      }

      // periodIndex = number of depreciation entries already booked for the
      // asset (safe for declining-balance / SYD / uneven schedules).
      const [priorCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(depreciationEntry)
        .where(eq(depreciationEntry.fixedAssetId, asset.id));
      const periodIndex = Number(priorCount?.count ?? 0);

      const amount = calculateMonthlyDepreciation({
        purchasePrice: asset.purchasePrice,
        residualValue: asset.residualValue,
        usefulLifeMonths: asset.usefulLifeMonths,
        depreciationMethod: asset.depreciationMethod,
        accumulatedDepreciation: asset.accumulatedDepreciation,
        purchaseDate: asset.purchaseDate,
        periodIndex,
        convention: asset.convention,
        inServiceDate: asset.inServiceDate ?? asset.purchaseDate,
        totalExpectedUnits: asset.totalExpectedUnits,
        // Bulk run can't supply per-asset usage readings, so units-of-production
        // assets are skipped here (amount resolves to 0) and depreciated via the
        // per-asset endpoint with a units reading.
        periodDate: today,
      });

      if (amount <= 0) continue;

      // Create journal entry if accounts configured
      let journalEntryId: string | null = null;

      if (asset.depreciationAccountId && asset.accumulatedDepAccountId) {
        const [maxResult] = await db
          .select({
            max: sql<number>`coalesce(max(${journalEntry.entryNumber}), 0)`,
          })
          .from(journalEntry)
          .where(eq(journalEntry.organizationId, ctx.organizationId));

        const entryNumber = (maxResult?.max || 0) + 1;

        const [entry] = await db
          .insert(journalEntry)
          .values({
            organizationId: ctx.organizationId,
            entryNumber,
            date: today,
            description: `Depreciation - ${asset.name} (${asset.assetNumber})`,
            reference: asset.assetNumber,
            status: "posted",
            sourceType: "depreciation",
            sourceId: asset.id,
            postedAt: new Date(),
            createdBy: ctx.userId,
          })
          .returning();

        journalEntryId = entry.id;

        await db.insert(journalLine).values([
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
            description: `Depreciation - ${asset.name}`,
            debitAmount: 0,
            creditAmount: amount,
          },
        ]);
      }

      // Create depreciation entry, stamped with the period so the idempotency
      // guard above can recognise it on a re-run.
      await db.insert(depreciationEntry).values({
        fixedAssetId: asset.id,
        date: today,
        amount,
        journalEntryId,
        periodStart: monthStart,
        periodEnd: monthEnd,
      });

      // Update asset
      const newAccumulated = asset.accumulatedDepreciation + amount;
      const newNetBookValue = asset.purchasePrice - newAccumulated;
      const newStatus =
        newNetBookValue <= asset.residualValue ? "fully_depreciated" : "active";

      await db
        .update(fixedAsset)
        .set({
          accumulatedDepreciation: newAccumulated,
          netBookValue: newNetBookValue,
          status: newStatus,
          updatedAt: new Date(),
        })
        .where(eq(fixedAsset.id, asset.id));

      results.push({
        assetId: asset.id,
        assetNumber: asset.assetNumber,
        amount,
      });
    }

    return NextResponse.json({
      message: skipped > 0
        ? `Depreciation run complete (${skipped} already done this month)`
        : `Depreciation run complete`,
      processed: results.length,
      skipped,
      results,
    });
  } catch (err) {
    return handleError(err);
  }
}
