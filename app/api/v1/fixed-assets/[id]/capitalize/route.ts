import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  fixedAsset,
  cwipCost,
  journalEntry,
  journalLine,
} from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound, validationError } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { logAudit } from "@/lib/api/audit";
import { getNextEntryNumber } from "@/lib/api/journal-automation";
import { z } from "zod";

const capitalizeSchema = z.object({
  // Date the asset is placed in service / capitalized. Also used as the
  // depreciation in-service anchor when not already set.
  date: z.string().min(1),
  // Optional override for the in-service date (defaults to the capitalize date).
  inServiceDate: z.string().optional(),
  // Optional overrides for the source CWIP and destination asset accounts.
  cwipAccountId: z.string().uuid().optional(),
  assetAccountId: z.string().uuid().optional(),
});

/**
 * Capitalize a capital-work-in-progress (CWIP) asset into service.
 *
 * Moves the total accumulated CWIP cost out of the CWIP account into the asset
 * account (DR Asset / CR CWIP), flips the asset out of CWIP, and sets it active
 * so it can begin depreciating.
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

    if (!asset.isCwip && asset.status !== "in_progress") {
      return validationError(
        "Asset is not a capital-work-in-progress asset"
      );
    }
    if (asset.status === "disposed") {
      return validationError("Cannot capitalize a disposed asset");
    }

    const body = await request.json().catch(() => ({}));
    const parsed = capitalizeSchema.parse(body);

    // Total accumulated CWIP cost for this asset.
    const [agg] = await db
      .select({
        total: sql<number>`coalesce(sum(${cwipCost.amount}), 0)`,
      })
      .from(cwipCost)
      .where(eq(cwipCost.fixedAssetId, asset.id));
    const cwipTotal = Number(agg?.total ?? 0);

    const result = await db.transaction(async (tx) => {
      let journalEntryId: string | null = null;

      const assetAccountId =
        parsed.assetAccountId ?? asset.assetAccountId ?? null;
      const cwipAccountId = parsed.cwipAccountId ?? asset.cwipAccountId ?? null;

      // Post the CWIP → asset transfer only when there's cost to move and both
      // accounts are configured; otherwise just flip the status flags.
      if (cwipTotal > 0 && assetAccountId && cwipAccountId) {
        const number = await getNextEntryNumber(ctx.organizationId, tx);
        const [entry] = await tx
          .insert(journalEntry)
          .values({
            organizationId: ctx.organizationId,
            entryNumber: number,
            date: parsed.date,
            description: `Capitalize CWIP - ${asset.name} (${asset.assetNumber})`,
            reference: asset.assetNumber,
            status: "posted",
            sourceType: "cwip_capitalization",
            sourceId: asset.id,
            postedAt: new Date(),
            createdBy: ctx.userId,
          })
          .returning();
        journalEntryId = entry.id;

        // DR Asset / CR CWIP — transfer accumulated cost into service.
        await tx.insert(journalLine).values([
          {
            journalEntryId: entry.id,
            accountId: assetAccountId,
            description: `Capitalize CWIP cost - ${asset.name}`,
            debitAmount: cwipTotal,
            creditAmount: 0,
          },
          {
            journalEntryId: entry.id,
            accountId: cwipAccountId,
            description: `Transfer out of CWIP - ${asset.name}`,
            debitAmount: 0,
            creditAmount: cwipTotal,
          },
        ]);
      } else if (cwipTotal > 0 && (!assetAccountId || !cwipAccountId)) {
        // We have cost to move but accounts are missing — fail rather than
        // silently leave the cost stranded in CWIP.
        throw new Error(
          "Asset and CWIP accounts must be configured to capitalize accumulated CWIP cost"
        );
      }

      // The capitalized carrying amount is the accumulated CWIP cost (falling
      // back to the recorded purchase price for assets with no tracked costs).
      const capitalizedCost = cwipTotal > 0 ? cwipTotal : asset.purchasePrice;
      const newNetBookValue = capitalizedCost - asset.accumulatedDepreciation;

      const [updated] = await tx
        .update(fixedAsset)
        .set({
          isCwip: false,
          status: "active",
          capitalizedDate: parsed.date,
          inServiceDate:
            parsed.inServiceDate ?? asset.inServiceDate ?? parsed.date,
          // Reflect the capitalized cost on the asset and refresh NBV.
          purchasePrice: capitalizedCost,
          netBookValue: newNetBookValue,
          assetAccountId,
          cwipAccountId,
          updatedAt: new Date(),
        })
        .where(eq(fixedAsset.id, id))
        .returning();

      return { asset: updated, capitalizedCost, journalEntryId };
    });

    logAudit({
      ctx,
      action: "capitalize",
      entityType: "fixed_asset",
      entityId: id,
      changes: {
        previousStatus: asset.status,
        cwipTotal,
        capitalizedCost: result.capitalizedCost,
      },
      request,
    });

    return NextResponse.json(result);
  } catch (err) {
    return handleError(err);
  }
}
