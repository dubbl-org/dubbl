import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  fixedAsset,
  assetRevaluation,
  journalEntry,
  journalLine,
} from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
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

const revalueSchema = z.object({
  // New revalued carrying amount (net book value) for the asset, in integer
  // cents. Must be greater than the current carrying amount — use the impair
  // route for downward revaluations.
  revaluedAmount: z.number().int().min(0),
  date: z.string().min(1),
  notes: z.string().optional(),
  // Optional overrides for the equity surplus / P&L reversal accounts.
  revaluationReserveAccountId: z.string().uuid().optional(),
  impairmentExpenseAccountId: z.string().uuid().optional(),
});

/**
 * IAS 16 upward revaluation.
 *
 * The increase in carrying amount is recognized:
 *   1) in P&L (CR Impairment Loss/Reversal 5510) to the extent it reverses a
 *      revaluation decrease (impairment) previously recognized in P&L for this
 *      asset, then
 *   2) the remainder in equity (CR Revaluation Surplus 3400).
 *
 * The carrying amount is adjusted by debiting the asset account for the full
 * increase. We track the cumulative impairment previously taken to P&L via the
 * asset_revaluation history so reversals are capped correctly.
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
      return validationError("Cannot revalue a disposed asset");
    }
    if (asset.isCwip || asset.status === "in_progress") {
      return validationError(
        "Cannot revalue a capital-work-in-progress asset; capitalize it first"
      );
    }

    const body = await request.json();
    const parsed = revalueSchema.parse(body);

    // Revaluation posts GL entries dated parsed.date — block locked/closed periods.
    await assertNotLocked(ctx.organizationId, parsed.date, ctx);

    // Current carrying amount = latest revalued amount if present, else NBV.
    const previousCarryingAmount = asset.revaluedAmount ?? asset.netBookValue;
    const changeAmount = parsed.revaluedAmount - previousCarryingAmount;

    if (changeAmount <= 0) {
      return validationError(
        "Revalued amount must be greater than the current carrying amount; use the impair route for downward revaluations"
      );
    }

    // Cap any P&L reversal at the cumulative impairment previously recognized in
    // P&L for this asset (net of prior reversals).
    const [impAgg] = await db
      .select({
        impaired: sql<number>`coalesce(sum(${assetRevaluation.impairmentAmount}), 0)`,
      })
      .from(assetRevaluation)
      .where(eq(assetRevaluation.fixedAssetId, asset.id));
    // impairmentAmount is stored signed: negative for impairment losses in P&L,
    // positive for reversals credited to P&L. The net negative is the balance
    // available to reverse.
    const netImpairmentInPnl = -Number(impAgg?.impaired ?? 0);
    const reversalToPnl = Math.max(
      0,
      Math.min(changeAmount, netImpairmentInPnl)
    );
    const surplusAmount = changeAmount - reversalToPnl;

    const { base: baseCurrency } = await resolveBaseRate(
      ctx.organizationId,
      undefined,
      parsed.date
    );

    const result = await db.transaction(async (tx) => {
      let journalEntryId: string | null = null;

      // Only post a GL entry when the asset account is configured; otherwise
      // we can't balance the books.
      if (asset.assetAccountId) {
        const surplusAccount =
          surplusAmount > 0
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
          reversalToPnl > 0
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
            description: `Revaluation (upward) - ${asset.name} (${asset.assetNumber})`,
            reference: asset.assetNumber,
            status: "posted",
            sourceType: "asset_revaluation",
            sourceId: asset.id,
            postedAt: new Date(),
            createdBy: ctx.userId,
          })
          .returning();
        journalEntryId = entry.id;

        const lines: (typeof journalLine.$inferInsert)[] = [
          // DR Asset — increase carrying amount.
          {
            journalEntryId: entry.id,
            accountId: asset.assetAccountId,
            description: `Revaluation increase - ${asset.name}`,
            debitAmount: changeAmount,
            creditAmount: 0,
          },
        ];

        // CR P&L reversal of prior impairment.
        if (reversalToPnl > 0 && impairmentAccount?.id) {
          lines.push({
            journalEntryId: entry.id,
            accountId: impairmentAccount.id,
            description: `Reversal of prior impairment - ${asset.name}`,
            debitAmount: 0,
            creditAmount: reversalToPnl,
          });
        }

        // CR Revaluation Surplus (equity) for the balance.
        if (surplusAmount > 0 && surplusAccount?.id) {
          lines.push({
            journalEntryId: entry.id,
            accountId: surplusAccount.id,
            description: `Revaluation surplus - ${asset.name}`,
            debitAmount: 0,
            creditAmount: surplusAmount,
          });
        }

        // If the surplus account could not be resolved, fold it into the P&L
        // line rather than post an unbalanced entry.
        const credited = lines
          .filter((l) => (l.creditAmount ?? 0) > 0)
          .reduce((s, l) => s + (l.creditAmount ?? 0), 0);
        if (credited !== changeAmount) {
          throw new Error(
            "Could not resolve a revaluation surplus/reversal account"
          );
        }

        await tx.insert(journalLine).values(lines);
      }

      // Record the revaluation history row. impairmentAmount stored signed:
      // positive here = reversal credited to P&L.
      const [revalRow] = await tx
        .insert(assetRevaluation)
        .values({
          fixedAssetId: asset.id,
          date: parsed.date,
          previousCarryingAmount,
          revaluedAmount: parsed.revaluedAmount,
          changeAmount,
          surplusAmount,
          impairmentAmount: reversalToPnl,
          isImpairment: false,
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
            asset.revaluationSurplusBalance + surplusAmount,
          revaluationReserveAccountId:
            parsed.revaluationReserveAccountId ??
            asset.revaluationReserveAccountId ??
            null,
          updatedAt: new Date(),
        })
        .where(eq(fixedAsset.id, id))
        .returning();

      return { revaluation: revalRow, asset: updated, journalEntryId };
    });

    logAudit({
      ctx,
      action: "revalue",
      entityType: "fixed_asset",
      entityId: id,
      changes: {
        previousCarryingAmount,
        revaluedAmount: parsed.revaluedAmount,
        changeAmount,
        surplusAmount,
        reversalToPnl,
      },
      request,
    });

    return NextResponse.json(result);
  } catch (err) {
    return handleError(err);
  }
}
