import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fixedAsset } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { logAudit } from "@/lib/api/audit";
import { postAssetDepreciation } from "@/lib/fixed-assets/post-depreciation";

/**
 * Record this month's depreciation for one asset (the Record value drop
 * button). Uses the same shared path as the bulk run and the nightly job: one
 * charge per calendar month, and the date must not be locked.
 */
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

    if (asset.status !== "active") {
      return NextResponse.json(
        { error: "Asset is not active" },
        { status: 400 }
      );
    }

    // Units-of-production assets need a usage reading for the period; optional
    // for time-based methods.
    let unitsThisPeriod: number | undefined;
    try {
      const body = await request.json();
      if (typeof body?.unitsThisPeriod === "number")
        unitsThisPeriod = body.unitsThisPeriod;
    } catch {
      // no JSON body — fine for time-based methods
    }

    if (asset.depreciationMethod === "units_of_production" && !unitsThisPeriod) {
      return NextResponse.json(
        { error: "Enter how many units were used this period" },
        { status: 400 }
      );
    }

    const today = new Date().toISOString().split("T")[0];
    const result = await postAssetDepreciation(asset, { date: today, unitsThisPeriod, ctx });

    if (result.status === "already_this_month") {
      return NextResponse.json(
        { error: `This month's value drop is already recorded (${result.month}). Undo it first to record it again.` },
        { status: 409 }
      );
    }
    if (result.status === "nothing_due") {
      return NextResponse.json(
        { error: "No depreciation remaining" },
        { status: 400 }
      );
    }

    logAudit({ ctx, action: "depreciate", entityType: "fixed_asset", entityId: id, changes: { amount: result.amount, journalEntryId: result.journalEntryId }, request });

    return NextResponse.json({
      depreciationEntry: result.depreciationEntry,
      asset: result.asset,
    });
  } catch (err) {
    return handleError(err);
  }
}
