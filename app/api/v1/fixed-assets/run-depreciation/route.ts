import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  fixedAsset,
  depreciationEntry,
  journalEntry,
  journalLine,
} from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
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
    const results: { assetId: string; assetNumber: string; amount: number }[] =
      [];

    for (const asset of assets) {
      const amount = calculateMonthlyDepreciation({
        purchasePrice: asset.purchasePrice,
        residualValue: asset.residualValue,
        usefulLifeMonths: asset.usefulLifeMonths,
        depreciationMethod: asset.depreciationMethod,
        accumulatedDepreciation: asset.accumulatedDepreciation,
        purchaseDate: asset.purchaseDate,
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

      // Create depreciation entry
      await db.insert(depreciationEntry).values({
        fixedAssetId: asset.id,
        date: today,
        amount,
        journalEntryId,
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
      message: `Depreciation run complete`,
      processed: results.length,
      results,
    });
  } catch (err) {
    return handleError(err);
  }
}
