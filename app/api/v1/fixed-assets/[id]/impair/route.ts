import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  fixedAsset,
  assetRevaluation,
  journalEntry,
  journalLine,
} from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound, validationError } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { logAudit } from "@/lib/api/audit";
import { assertNotLocked } from "@/lib/api/period-lock";
import {
  getNextEntryNumber,
  ensureAccountByCode,
  resolveBaseRate,
} from "@/lib/api/journal-automation";
import { z } from "zod";

const impairSchema = z.object({
  // New (lower) recoverable carrying amount for the asset, in integer cents.
  // Must be less than the current carrying amount.
  revaluedAmount: z.number().int().min(0),
  date: z.string().min(1),
  notes: z.string().optional(),
  // Optional overrides for the equity surplus / P&L impairment accounts.
  revaluationReserveAccountId: z.string().uuid().optional(),
  impairmentExpenseAccountId: z.string().uuid().optional(),
});

/**
 * IAS 16 / IAS 36 downward revaluation (impairment).
 *
 * The decrease in carrying amount is recognized:
 *   1) in equity (DR Revaluation Surplus 3400) to the extent of any credit
 *      balance held in the revaluation surplus for this asset, then
 *   2) the remainder in P&L (DR Impairment Loss 5510).
 *
 * The carrying amount is reduced by crediting the asset account for the full
 * decrease.
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

    if (asset.status === "disposed") {
      return validationError("Cannot impair a disposed asset");
    }
    if (asset.isCwip || asset.status === "in_progress") {
      return validationError(
        "Cannot impair a capital-work-in-progress asset; capitalize it first"
      );
    }

    const body = await request.json();
    const parsed = impairSchema.parse(body);

    // Impairment posts GL entries dated parsed.date — block locked/closed periods.
    await assertNotLocked(ctx.organizationId, parsed.date, ctx);

    // Current carrying amount = latest revalued amount if present, else NBV.
    const previousCarryingAmount = asset.revaluedAmount ?? asset.netBookValue;
    // Signed change (negative for a decrease).
    const changeAmount = parsed.revaluedAmount - previousCarryingAmount;

    if (changeAmount >= 0) {
      return validationError(
        "Impaired amount must be less than the current carrying amount; use the revalue route for upward revaluations"
      );
    }

    const decrease = Math.abs(changeAmount);
    // Absorb against any existing revaluation surplus held in equity first.
    const surplusUsed = Math.min(decrease, asset.revaluationSurplusBalance);
    const impairmentToPnl = decrease - surplusUsed;

    const { base: baseCurrency } = await resolveBaseRate(
      ctx.organizationId,
      undefined,
      parsed.date
    );

    const result = await db.transaction(async (tx) => {
      let journalEntryId: string | null = null;

      if (asset.assetAccountId) {
        const surplusAccount =
          surplusUsed > 0
            ? parsed.revaluationReserveAccountId
              ? { id: parsed.revaluationReserveAccountId }
              : asset.revaluationReserveAccountId
                ? { id: asset.revaluationReserveAccountId }
                : await ensureAccountByCode(
                    ctx.organizationId,
                    {
                      code: "3400",
                      name: "Revaluation Surplus",
                      type: "equity",
                      subType: "other_equity",
                    },
                    baseCurrency,
                    tx
                  )
            : null;

        const impairmentAccount =
          impairmentToPnl > 0
            ? parsed.impairmentExpenseAccountId
              ? { id: parsed.impairmentExpenseAccountId }
              : asset.impairmentExpenseAccountId
                ? { id: asset.impairmentExpenseAccountId }
                : await ensureAccountByCode(
                    ctx.organizationId,
                    {
                      code: "5510",
                      name: "Impairment Loss",
                      type: "expense",
                      subType: "other_expense",
                    },
                    baseCurrency,
                    tx
                  )
            : null;

        const number = await getNextEntryNumber(ctx.organizationId, tx);
        const [entry] = await tx
          .insert(journalEntry)
          .values({
            organizationId: ctx.organizationId,
            entryNumber: number,
            date: parsed.date,
            description: `Impairment (downward revaluation) - ${asset.name} (${asset.assetNumber})`,
            reference: asset.assetNumber,
            status: "posted",
            sourceType: "asset_impairment",
            sourceId: asset.id,
            postedAt: new Date(),
            createdBy: ctx.userId,
          })
          .returning();
        journalEntryId = entry.id;

        const lines: (typeof journalLine.$inferInsert)[] = [];

        // DR Revaluation Surplus (equity) up to the available balance.
        if (surplusUsed > 0 && surplusAccount?.id) {
          lines.push({
            journalEntryId: entry.id,
            accountId: surplusAccount.id,
            description: `Reverse revaluation surplus on impairment - ${asset.name}`,
            debitAmount: surplusUsed,
            creditAmount: 0,
          });
        }

        // DR Impairment Loss (P&L) for the remainder.
        if (impairmentToPnl > 0 && impairmentAccount?.id) {
          lines.push({
            journalEntryId: entry.id,
            accountId: impairmentAccount.id,
            description: `Impairment loss - ${asset.name}`,
            debitAmount: impairmentToPnl,
            creditAmount: 0,
          });
        }

        // CR Asset — reduce carrying amount.
        lines.push({
          journalEntryId: entry.id,
          accountId: asset.assetAccountId,
          description: `Impairment write-down - ${asset.name}`,
          debitAmount: 0,
          creditAmount: decrease,
        });

        // Refuse to post an unbalanced entry if a debit account was unresolved.
        const debited = lines
          .filter((l) => (l.debitAmount ?? 0) > 0)
          .reduce((s, l) => s + (l.debitAmount ?? 0), 0);
        if (debited !== decrease) {
          throw new Error(
            "Could not resolve a revaluation surplus/impairment account"
          );
        }

        await tx.insert(journalLine).values(lines);
      }

      // Record the revaluation history row. impairmentAmount stored signed:
      // negative here = impairment loss recognized in P&L.
      const [revalRow] = await tx
        .insert(assetRevaluation)
        .values({
          fixedAssetId: asset.id,
          date: parsed.date,
          previousCarryingAmount,
          revaluedAmount: parsed.revaluedAmount,
          changeAmount,
          surplusAmount: -surplusUsed,
          impairmentAmount: -impairmentToPnl,
          isImpairment: true,
          notes: parsed.notes ?? null,
          journalEntryId,
        })
        .returning();

      const [updated] = await tx
        .update(fixedAsset)
        .set({
          revaluedAmount: parsed.revaluedAmount,
          netBookValue: parsed.revaluedAmount,
          revaluationSurplusBalance:
            asset.revaluationSurplusBalance - surplusUsed,
          revaluationReserveAccountId:
            parsed.revaluationReserveAccountId ??
            asset.revaluationReserveAccountId ??
            null,
          impairmentExpenseAccountId:
            parsed.impairmentExpenseAccountId ??
            asset.impairmentExpenseAccountId ??
            null,
          updatedAt: new Date(),
        })
        .where(eq(fixedAsset.id, id))
        .returning();

      return { revaluation: revalRow, asset: updated, journalEntryId };
    });

    logAudit({
      ctx,
      action: "impair",
      entityType: "fixed_asset",
      entityId: id,
      changes: {
        previousCarryingAmount,
        revaluedAmount: parsed.revaluedAmount,
        changeAmount,
        surplusUsed,
        impairmentToPnl,
      },
      request,
    });

    return NextResponse.json(result);
  } catch (err) {
    return handleError(err);
  }
}
