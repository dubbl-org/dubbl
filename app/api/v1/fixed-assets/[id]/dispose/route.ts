import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  fixedAsset,
  journalEntry,
  journalLine,
} from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { logAudit } from "@/lib/api/audit";
import { z } from "zod";

const disposeSchema = z.object({
  disposalAmount: z.number().int().min(0),
  date: z.string().min(1),
});

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
        { error: "Asset is already disposed" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const parsed = disposeSchema.parse(body);

    // Create disposal journal entry if accounts configured
    if (
      asset.assetAccountId &&
      asset.accumulatedDepAccountId
    ) {
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
          date: parsed.date,
          description: `Disposal - ${asset.name} (${asset.assetNumber})`,
          reference: asset.assetNumber,
          status: "posted",
          sourceType: "disposal",
          sourceId: asset.id,
          postedAt: new Date(),
          createdBy: ctx.userId,
        })
        .returning();

      const lines: (typeof journalLine.$inferInsert)[] = [];

      // DR Accumulated Depreciation (remove contra-asset)
      lines.push({
        journalEntryId: entry.id,
        accountId: asset.accumulatedDepAccountId,
        description: `Disposal - ${asset.name}`,
        debitAmount: asset.accumulatedDepreciation,
        creditAmount: 0,
      });

      // CR Fixed Asset (remove asset)
      lines.push({
        journalEntryId: entry.id,
        accountId: asset.assetAccountId,
        description: `Disposal - ${asset.name}`,
        debitAmount: 0,
        creditAmount: asset.purchasePrice,
      });

      // If disposal amount received (e.g., sold)
      // The gain/loss is the difference between disposal amount and net book value
      const gainOrLoss = parsed.disposalAmount - asset.netBookValue;

      if (parsed.disposalAmount > 0) {
        // DR Cash/Bank for disposal proceeds
        // We use asset account as a placeholder; in practice user would pick bank account
        lines.push({
          journalEntryId: entry.id,
          accountId: asset.assetAccountId,
          description: `Disposal proceeds - ${asset.name}`,
          debitAmount: parsed.disposalAmount,
          creditAmount: 0,
        });
      }

      if (gainOrLoss > 0) {
        // CR Gain on disposal
        lines.push({
          journalEntryId: entry.id,
          accountId: asset.depreciationAccountId || asset.assetAccountId!,
          description: `Gain on disposal - ${asset.name}`,
          debitAmount: 0,
          creditAmount: gainOrLoss,
        });
      } else if (gainOrLoss < 0) {
        // DR Loss on disposal
        lines.push({
          journalEntryId: entry.id,
          accountId: asset.depreciationAccountId || asset.assetAccountId!,
          description: `Loss on disposal - ${asset.name}`,
          debitAmount: Math.abs(gainOrLoss),
          creditAmount: 0,
        });
      }

      await db.insert(journalLine).values(lines);
    }

    // Update asset
    const [updated] = await db
      .update(fixedAsset)
      .set({
        status: "disposed",
        disposalDate: parsed.date,
        disposalAmount: parsed.disposalAmount,
        netBookValue: 0,
        updatedAt: new Date(),
      })
      .where(eq(fixedAsset.id, id))
      .returning();

    logAudit({ ctx, action: "dispose", entityType: "fixed_asset", entityId: id, changes: { previousStatus: asset.status }, request });

    return NextResponse.json({ asset: updated });
  } catch (err) {
    return handleError(err);
  }
}
