import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fixedAsset } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { logAudit } from "@/lib/api/audit";
import { postAssetDepreciation } from "@/lib/fixed-assets/post-depreciation";

/**
 * Depreciate every active asset for the current month. Shares
 * postAssetDepreciation with the per-asset button and the nightly job, so it's
 * idempotent per month and refuses a locked date (422).
 */
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
    let skipped = 0;

    for (const asset of assets) {
      // Units-of-production assets need a usage reading, which a bulk run
      // can't supply; they resolve to nothing_due and are recorded one by one.
      const result = await postAssetDepreciation(asset, { date: today, ctx });
      if (result.status === "already_this_month") {
        skipped++;
        continue;
      }
      if (result.status !== "posted") continue;

      results.push({
        assetId: asset.id,
        assetNumber: asset.assetNumber,
        amount: result.amount,
      });
    }

    if (results.length > 0) {
      logAudit({ ctx, action: "depreciate", entityType: "fixed_asset", entityId: ctx.organizationId, changes: { processed: results.length }, request });
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
