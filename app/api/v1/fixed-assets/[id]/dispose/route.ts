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
import { handleError, notFound } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { logAudit } from "@/lib/api/audit";
import { assertNotLocked } from "@/lib/api/period-lock";
import {
  getNextEntryNumber,
  findAccountByCode,
  ensureAccountByCode,
  resolveBaseRate,
} from "@/lib/api/journal-automation";
import { calculateMonthlyDepreciation } from "@/lib/fixed-assets/depreciation";
import { z } from "zod";

const disposeSchema = z.object({
  disposalAmount: z.number().int().min(0),
  date: z.string().min(1),
  // Where the sale proceeds land (bank/clearing account). Falls back to
  // Undeposited Funds (1250) / Cash (1100) when not supplied.
  proceedsAccountId: z.string().uuid().optional(),
  // Optional overrides for the gain/loss recognition accounts.
  gainAccountId: z.string().uuid().optional(),
  lossAccountId: z.string().uuid().optional(),
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

    // Disposal posts GL entries dated parsed.date — don't let it write into a
    // locked period or closed fiscal year and silently change finalized books.
    await assertNotLocked(ctx.organizationId, parsed.date, ctx);

    // Resolve the org base currency once — used when find-or-creating the
    // gain/loss/proceeds/equity accounts so existing charts get them on demand.
    const { base: baseCurrency } = await resolveBaseRate(
      ctx.organizationId,
      undefined,
      parsed.date
    );

    // Depreciation catch-up to the disposal date: book the asset's final stub
    // period (if any depreciable amount remains) so gain/loss is computed on the
    // true net book value at disposal rather than a stale carrying amount.
    let catchUpAmount = 0;
    if (asset.status === "active") {
      const [priorCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(depreciationEntry)
        .where(eq(depreciationEntry.fixedAssetId, asset.id));
      const periodIndex = Number(priorCount?.count ?? 0);

      catchUpAmount = calculateMonthlyDepreciation({
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
        unitsThisPeriod: undefined,
        periodDate: parsed.date,
      });
    }

    // Effective accumulated depreciation / net book value at disposal, after the
    // catch-up charge.
    const effectiveAccumulated =
      asset.accumulatedDepreciation + catchUpAmount;
    const netBookValue = asset.purchasePrice - effectiveAccumulated;
    // Gain (positive) or loss (negative): proceeds minus net book value.
    const gainOrLoss = parsed.disposalAmount - netBookValue;

    const updated = await db.transaction(async (tx) => {
      // Only post a GL entry when the asset has its asset + accumulated
      // depreciation accounts configured; otherwise the books can't be balanced.
      if (asset.assetAccountId && asset.accumulatedDepAccountId) {
        // Catch-up depreciation entry first, so the disposal entry removes the
        // full accumulated depreciation balance.
        if (catchUpAmount > 0) {
          if (asset.depreciationAccountId) {
            const depNumber = await getNextEntryNumber(ctx.organizationId, tx);
            const [depEntry] = await tx
              .insert(journalEntry)
              .values({
                organizationId: ctx.organizationId,
                entryNumber: depNumber,
                date: parsed.date,
                description: `Disposal depreciation catch-up - ${asset.name} (${asset.assetNumber})`,
                reference: asset.assetNumber,
                status: "posted",
                sourceType: "depreciation",
                sourceId: asset.id,
                postedAt: new Date(),
                createdBy: ctx.userId,
              })
              .returning();

            await tx.insert(journalLine).values([
              {
                journalEntryId: depEntry.id,
                accountId: asset.depreciationAccountId,
                description: `Depreciation catch-up - ${asset.name}`,
                debitAmount: catchUpAmount,
                creditAmount: 0,
              },
              {
                journalEntryId: depEntry.id,
                accountId: asset.accumulatedDepAccountId,
                description: `Depreciation catch-up - ${asset.name}`,
                debitAmount: 0,
                creditAmount: catchUpAmount,
              },
            ]);

            await tx.insert(depreciationEntry).values({
              fixedAssetId: asset.id,
              date: parsed.date,
              amount: catchUpAmount,
              journalEntryId: depEntry.id,
            });
          } else {
            // No depreciation expense account — can't post the catch-up charge,
            // so don't fold it into accumulated either; revert to the recorded
            // accumulated depreciation for the disposal math below.
            catchUpAmount = 0;
          }
        }

        // Recompute with whatever catch-up actually posted.
        const postedAccumulated = asset.accumulatedDepreciation + catchUpAmount;
        const postedNbv = asset.purchasePrice - postedAccumulated;
        const postedGainOrLoss = parsed.disposalAmount - postedNbv;

        // Resolve the proceeds account: explicit override → Undeposited Funds
        // (1250) → Cash (1100).
        let proceedsAccountId = parsed.proceedsAccountId ?? null;
        if (!proceedsAccountId && parsed.disposalAmount > 0) {
          const undeposited =
            (await findAccountByCode(ctx.organizationId, "1250", tx)) ??
            (await ensureAccountByCode(
              ctx.organizationId,
              {
                code: "1250",
                name: "Undeposited Funds",
                type: "asset",
                subType: "current",
              },
              baseCurrency,
              tx
            )) ??
            (await findAccountByCode(ctx.organizationId, "1100", tx));
          proceedsAccountId = undeposited?.id ?? null;
        }
        // Fail cleanly rather than post an unbalanced entry if proceeds were
        // received but no account could be resolved.
        if (parsed.disposalAmount > 0 && !proceedsAccountId) {
          throw new Error(
            "Could not resolve a proceeds account for the disposal"
          );
        }

        const number = await getNextEntryNumber(ctx.organizationId, tx);
        const [entry] = await tx
          .insert(journalEntry)
          .values({
            organizationId: ctx.organizationId,
            entryNumber: number,
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

        // DR Accumulated Depreciation — remove the contra-asset balance.
        if (postedAccumulated > 0) {
          lines.push({
            journalEntryId: entry.id,
            accountId: asset.accumulatedDepAccountId,
            description: `Disposal - remove accumulated depreciation - ${asset.name}`,
            debitAmount: postedAccumulated,
            creditAmount: 0,
          });
        }

        // CR Fixed Asset — remove the asset at original cost.
        lines.push({
          journalEntryId: entry.id,
          accountId: asset.assetAccountId,
          description: `Disposal - remove asset at cost - ${asset.name}`,
          debitAmount: 0,
          creditAmount: asset.purchasePrice,
        });

        // DR proceeds account (bank/clearing) for sale proceeds received.
        if (parsed.disposalAmount > 0 && proceedsAccountId) {
          lines.push({
            journalEntryId: entry.id,
            accountId: proceedsAccountId,
            description: `Disposal proceeds - ${asset.name}`,
            debitAmount: parsed.disposalAmount,
            creditAmount: 0,
          });
        }

        // Recognize gain or loss for the balancing difference.
        if (postedGainOrLoss > 0) {
          // CR 4300 Gain on Asset Disposal.
          let gainAccountId = parsed.gainAccountId ?? null;
          if (!gainAccountId) {
            const gainAccount = await ensureAccountByCode(
              ctx.organizationId,
              {
                code: "4300",
                name: "Gain on Asset Disposal",
                type: "revenue",
                subType: "other_income",
              },
              baseCurrency,
              tx
            );
            gainAccountId = gainAccount?.id ?? null;
          }
          if (gainAccountId) {
            lines.push({
              journalEntryId: entry.id,
              accountId: gainAccountId,
              description: `Gain on disposal - ${asset.name}`,
              debitAmount: 0,
              creditAmount: postedGainOrLoss,
            });
          }
        } else if (postedGainOrLoss < 0) {
          // DR 5920 Loss on Asset Disposal.
          let lossAccountId = parsed.lossAccountId ?? null;
          if (!lossAccountId) {
            const lossAccount = await ensureAccountByCode(
              ctx.organizationId,
              {
                code: "5920",
                name: "Loss on Asset Disposal",
                type: "expense",
                subType: "other_expense",
              },
              baseCurrency,
              tx
            );
            lossAccountId = lossAccount?.id ?? null;
          }
          if (lossAccountId) {
            lines.push({
              journalEntryId: entry.id,
              accountId: lossAccountId,
              description: `Loss on disposal - ${asset.name}`,
              debitAmount: Math.abs(postedGainOrLoss),
              creditAmount: 0,
            });
          }
        }

        await tx.insert(journalLine).values(lines);

        // Transfer any revaluation surplus held in equity for this asset to
        // retained earnings on disposal (IAS 16): DR 3400 / CR 3100.
        if (asset.revaluationSurplusBalance > 0) {
          const surplusAccount =
            (asset.revaluationReserveAccountId
              ? { id: asset.revaluationReserveAccountId }
              : null) ??
            (await ensureAccountByCode(
              ctx.organizationId,
              {
                code: "3400",
                name: "Revaluation Surplus",
                type: "equity",
                subType: "other_equity",
              },
              baseCurrency,
              tx
            ));
          const retainedEarnings = await ensureAccountByCode(
            ctx.organizationId,
            {
              code: "3100",
              name: "Retained Earnings",
              type: "equity",
              subType: "retained_earnings",
            },
            baseCurrency,
            tx
          );

          if (surplusAccount?.id && retainedEarnings?.id) {
            const surplusNumber = await getNextEntryNumber(ctx.organizationId, tx);
            const [surplusEntry] = await tx
              .insert(journalEntry)
              .values({
                organizationId: ctx.organizationId,
                entryNumber: surplusNumber,
                date: parsed.date,
                description: `Disposal - transfer revaluation surplus to retained earnings - ${asset.name} (${asset.assetNumber})`,
                reference: asset.assetNumber,
                status: "posted",
                sourceType: "disposal_revaluation_transfer",
                sourceId: asset.id,
                postedAt: new Date(),
                createdBy: ctx.userId,
              })
              .returning();

            await tx.insert(journalLine).values([
              {
                journalEntryId: surplusEntry.id,
                accountId: surplusAccount.id,
                description: `Transfer revaluation surplus on disposal - ${asset.name}`,
                debitAmount: asset.revaluationSurplusBalance,
                creditAmount: 0,
              },
              {
                journalEntryId: surplusEntry.id,
                accountId: retainedEarnings.id,
                description: `Realized revaluation surplus on disposal - ${asset.name}`,
                debitAmount: 0,
                creditAmount: asset.revaluationSurplusBalance,
              },
            ]);
          }
        }
      }

      const [row] = await tx
        .update(fixedAsset)
        .set({
          status: "disposed",
          disposalDate: parsed.date,
          disposalAmount: parsed.disposalAmount,
          accumulatedDepreciation: asset.accumulatedDepreciation + catchUpAmount,
          netBookValue: 0,
          revaluationSurplusBalance: 0,
          updatedAt: new Date(),
        })
        .where(eq(fixedAsset.id, id))
        .returning();

      return row;
    });

    logAudit({
      ctx,
      action: "dispose",
      entityType: "fixed_asset",
      entityId: id,
      changes: {
        previousStatus: asset.status,
        disposalAmount: parsed.disposalAmount,
        gainOrLoss,
      },
      request,
    });

    return NextResponse.json({ asset: updated });
  } catch (err) {
    return handleError(err);
  }
}
