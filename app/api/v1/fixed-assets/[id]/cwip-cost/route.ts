import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  fixedAsset,
  cwipCost,
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

const addCostSchema = z.object({
  // Cost incurred on the asset-under-construction, in integer cents.
  amount: z.number().int().min(1),
  date: z.string().min(1),
  // Plain-language note for what the cost was for (optional).
  description: z.string().optional(),
  // Account the money came from (e.g. bank / payables / clearing). Credited.
  sourceAccountId: z.string().uuid(),
  // Optional override for the CWIP account to debit (defaults to the asset's
  // configured CWIP account).
  cwipAccountId: z.string().uuid().optional(),
});

/**
 * List the construction costs accumulated against a capital-work-in-progress
 * (CWIP) asset, newest first. Amounts are in integer cents.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);

    const asset = await db.query.fixedAsset.findFirst({
      where: and(
        eq(fixedAsset.id, id),
        eq(fixedAsset.organizationId, ctx.organizationId),
        notDeleted(fixedAsset.deletedAt)
      ),
      columns: { id: true },
    });
    if (!asset) return notFound("Fixed asset");

    const costs = await db.query.cwipCost.findMany({
      where: eq(cwipCost.fixedAssetId, id),
      with: { journalEntry: true },
      orderBy: (c, { desc }) => [desc(c.date), desc(c.createdAt)],
    });

    const total = costs.reduce((s, c) => s + c.amount, 0);

    return NextResponse.json({ costs, total });
  } catch (err) {
    return handleError(err);
  }
}

/**
 * Add a construction cost to a capital-work-in-progress (CWIP) asset before it
 * is capitalized into service.
 *
 * Posts DR CWIP (asset-under-construction) / CR the source account for the cost,
 * and records a cwip_cost history row. amount is in integer cents.
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
      return validationError("Cannot add costs to a disposed asset");
    }
    if (!asset.isCwip && asset.status !== "in_progress") {
      return validationError(
        "Construction costs can only be added to an asset that is not in use yet"
      );
    }

    const body = await request.json();
    const parsed = addCostSchema.parse(body);

    // Adding a cost posts a GL entry dated parsed.date — block locked/closed
    // periods so we don't write into finalized books.
    await assertNotLocked(ctx.organizationId, parsed.date, ctx);

    const { base: baseCurrency } = await resolveBaseRate(
      ctx.organizationId,
      undefined,
      parsed.date
    );

    const result = await db.transaction(async (tx) => {
      // Resolve the CWIP account to debit: explicit override → asset's CWIP
      // account → find-or-create the default Assets Under Construction account.
      let cwipAccountId =
        parsed.cwipAccountId ?? asset.cwipAccountId ?? null;
      if (!cwipAccountId) {
        const cwipAccount = await ensureAccountByCode(
          ctx.organizationId,
          {
            code: "1700",
            name: "Assets Under Construction",
            type: "asset",
            subType: "fixed_asset",
          },
          baseCurrency,
          tx
        );
        cwipAccountId = cwipAccount?.id ?? null;
      }
      if (!cwipAccountId) {
        throw new Error(
          "Could not resolve a capital-work-in-progress account to record the cost against"
        );
      }

      const number = await getNextEntryNumber(ctx.organizationId, tx);
      const [entry] = await tx
        .insert(journalEntry)
        .values({
          organizationId: ctx.organizationId,
          entryNumber: number,
          date: parsed.date,
          description: `Construction cost - ${asset.name} (${asset.assetNumber})`,
          reference: asset.assetNumber,
          status: "posted",
          sourceType: "cwip_cost",
          sourceId: asset.id,
          postedAt: new Date(),
          createdBy: ctx.userId,
        })
        .returning();

      // DR CWIP / CR source account.
      await tx.insert(journalLine).values([
        {
          journalEntryId: entry.id,
          accountId: cwipAccountId,
          description:
            parsed.description ?? `Construction cost - ${asset.name}`,
          debitAmount: parsed.amount,
          creditAmount: 0,
        },
        {
          journalEntryId: entry.id,
          accountId: parsed.sourceAccountId,
          description:
            parsed.description ?? `Construction cost - ${asset.name}`,
          debitAmount: 0,
          creditAmount: parsed.amount,
        },
      ]);

      const [costRow] = await tx
        .insert(cwipCost)
        .values({
          fixedAssetId: asset.id,
          date: parsed.date,
          description: parsed.description ?? null,
          amount: parsed.amount,
          journalEntryId: entry.id,
        })
        .returning();

      // Keep the asset's CWIP account in sync if it wasn't set yet, and reflect
      // the running construction cost on the recorded purchase price so the
      // detail figures stay meaningful before capitalization.
      const [updated] = await tx
        .update(fixedAsset)
        .set({
          cwipAccountId,
          purchasePrice: asset.purchasePrice + parsed.amount,
          netBookValue: asset.netBookValue + parsed.amount,
          updatedAt: new Date(),
        })
        .where(eq(fixedAsset.id, id))
        .returning();

      return { cost: costRow, asset: updated, journalEntryId: entry.id };
    });

    logAudit({
      ctx,
      action: "add_cwip_cost",
      entityType: "fixed_asset",
      entityId: id,
      changes: {
        amount: parsed.amount,
        date: parsed.date,
        sourceAccountId: parsed.sourceAccountId,
      },
      request,
    });

    return NextResponse.json(result);
  } catch (err) {
    return handleError(err);
  }
}
