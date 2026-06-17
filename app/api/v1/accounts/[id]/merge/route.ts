import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  chartAccount,
  journalLine,
  taxComponent,
  inventoryItem,
  assetCategory,
  fixedAsset,
  contact,
  bankAccount,
  bankTransaction,
  bankRule,
  expenseItem,
  budgetLine,
  accrualSchedule,
  revenueSchedule,
  recurringTemplateLine,
  loan,
  invoiceLine,
  quoteLine,
  creditNoteLine,
  billLine,
  purchaseOrderLine,
  debitNoteLine,
} from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext, AuthError } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { logAudit } from "@/lib/api/audit";
import { handleError } from "@/lib/api/response";
import { z } from "zod";

const mergeSchema = z.object({
  targetAccountId: z.string().uuid(),
});

/**
 * POST /api/v1/accounts/[id]/merge
 *
 * Merges the source account ([id]) into the target account
 * ({ targetAccountId }). Both accounts must belong to the caller's org and
 * share the same account type. All financial and configuration FKs that point
 * at the source account are repointed to the target inside a single
 * transaction, then the source is soft-deleted (deletedAt + isActive=false).
 *
 * This is irreversible at the data level: balances and history move to the
 * target account. The repointing covers journal lines, tax components, document
 * lines (invoice/quote/credit-note/bill/PO/debit-note), and the various
 * default/control account mappings (contacts, bank accounts/rules/transactions,
 * inventory items, fixed assets + categories, budgets, accruals, revenue
 * schedules, recurring template lines, loans, expense items).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:accounts");

    const body = await request.json();
    const { targetAccountId } = mergeSchema.parse(body);

    if (targetAccountId === id) {
      return NextResponse.json(
        { error: "Cannot merge an account into itself" },
        { status: 400 }
      );
    }

    const source = await db.query.chartAccount.findFirst({
      where: and(
        eq(chartAccount.id, id),
        eq(chartAccount.organizationId, ctx.organizationId)
      ),
    });
    if (!source) {
      return NextResponse.json(
        { error: "Source account not found" },
        { status: 404 }
      );
    }
    if (source.deletedAt) {
      return NextResponse.json(
        { error: "Source account has already been merged or deleted" },
        { status: 409 }
      );
    }

    const target = await db.query.chartAccount.findFirst({
      where: and(
        eq(chartAccount.id, targetAccountId),
        eq(chartAccount.organizationId, ctx.organizationId)
      ),
    });
    if (!target) {
      return NextResponse.json(
        { error: "Target account not found" },
        { status: 404 }
      );
    }
    if (target.deletedAt) {
      return NextResponse.json(
        { error: "Target account has been deleted" },
        { status: 409 }
      );
    }

    // Same-type guard: merging across types would corrupt the trial balance.
    if (source.type !== target.type) {
      return NextResponse.json(
        { error: "Accounts must be the same type to merge" },
        { status: 422 }
      );
    }

    await db.transaction(async (tx) => {
      // Core ledger + tax mappings (the required minimum).
      await tx
        .update(journalLine)
        .set({ accountId: targetAccountId })
        .where(eq(journalLine.accountId, id));

      await tx
        .update(taxComponent)
        .set({ accountId: targetAccountId })
        .where(eq(taxComponent.accountId, id));

      // Document lines.
      await tx
        .update(invoiceLine)
        .set({ accountId: targetAccountId })
        .where(eq(invoiceLine.accountId, id));
      await tx
        .update(quoteLine)
        .set({ accountId: targetAccountId })
        .where(eq(quoteLine.accountId, id));
      await tx
        .update(creditNoteLine)
        .set({ accountId: targetAccountId })
        .where(eq(creditNoteLine.accountId, id));
      await tx
        .update(billLine)
        .set({ accountId: targetAccountId })
        .where(eq(billLine.accountId, id));
      await tx
        .update(purchaseOrderLine)
        .set({ accountId: targetAccountId })
        .where(eq(purchaseOrderLine.accountId, id));
      await tx
        .update(debitNoteLine)
        .set({ accountId: targetAccountId })
        .where(eq(debitNoteLine.accountId, id));
      await tx
        .update(expenseItem)
        .set({ accountId: targetAccountId })
        .where(eq(expenseItem.accountId, id));

      // Bank feed + rules + transactions.
      await tx
        .update(bankAccount)
        .set({ chartAccountId: targetAccountId })
        .where(eq(bankAccount.chartAccountId, id));
      await tx
        .update(bankTransaction)
        .set({ accountId: targetAccountId })
        .where(eq(bankTransaction.accountId, id));
      await tx
        .update(bankRule)
        .set({ accountId: targetAccountId })
        .where(eq(bankRule.accountId, id));

      // Contact default mappings.
      await tx
        .update(contact)
        .set({ defaultRevenueAccountId: targetAccountId })
        .where(eq(contact.defaultRevenueAccountId, id));
      await tx
        .update(contact)
        .set({ defaultExpenseAccountId: targetAccountId })
        .where(eq(contact.defaultExpenseAccountId, id));

      // Inventory item account mappings.
      await tx
        .update(inventoryItem)
        .set({ costAccountId: targetAccountId })
        .where(eq(inventoryItem.costAccountId, id));
      await tx
        .update(inventoryItem)
        .set({ revenueAccountId: targetAccountId })
        .where(eq(inventoryItem.revenueAccountId, id));
      await tx
        .update(inventoryItem)
        .set({ inventoryAccountId: targetAccountId })
        .where(eq(inventoryItem.inventoryAccountId, id));

      // Fixed asset category + asset account mappings.
      await tx
        .update(assetCategory)
        .set({ assetAccountId: targetAccountId })
        .where(eq(assetCategory.assetAccountId, id));
      await tx
        .update(assetCategory)
        .set({ depreciationAccountId: targetAccountId })
        .where(eq(assetCategory.depreciationAccountId, id));
      await tx
        .update(assetCategory)
        .set({ accumulatedDepAccountId: targetAccountId })
        .where(eq(assetCategory.accumulatedDepAccountId, id));
      await tx
        .update(assetCategory)
        .set({ cwipAccountId: targetAccountId })
        .where(eq(assetCategory.cwipAccountId, id));

      await tx
        .update(fixedAsset)
        .set({ assetAccountId: targetAccountId })
        .where(eq(fixedAsset.assetAccountId, id));
      await tx
        .update(fixedAsset)
        .set({ depreciationAccountId: targetAccountId })
        .where(eq(fixedAsset.depreciationAccountId, id));
      await tx
        .update(fixedAsset)
        .set({ accumulatedDepAccountId: targetAccountId })
        .where(eq(fixedAsset.accumulatedDepAccountId, id));
      await tx
        .update(fixedAsset)
        .set({ cwipAccountId: targetAccountId })
        .where(eq(fixedAsset.cwipAccountId, id));
      await tx
        .update(fixedAsset)
        .set({ revaluationReserveAccountId: targetAccountId })
        .where(eq(fixedAsset.revaluationReserveAccountId, id));
      await tx
        .update(fixedAsset)
        .set({ impairmentExpenseAccountId: targetAccountId })
        .where(eq(fixedAsset.impairmentExpenseAccountId, id));

      // Planning / scheduling tables.
      await tx
        .update(budgetLine)
        .set({ accountId: targetAccountId })
        .where(eq(budgetLine.accountId, id));
      await tx
        .update(accrualSchedule)
        .set({ accountId: targetAccountId })
        .where(eq(accrualSchedule.accountId, id));
      await tx
        .update(accrualSchedule)
        .set({ reverseAccountId: targetAccountId })
        .where(eq(accrualSchedule.reverseAccountId, id));
      await tx
        .update(revenueSchedule)
        .set({ deferredRevenueAccountId: targetAccountId })
        .where(eq(revenueSchedule.deferredRevenueAccountId, id));
      await tx
        .update(revenueSchedule)
        .set({ revenueAccountId: targetAccountId })
        .where(eq(revenueSchedule.revenueAccountId, id));
      await tx
        .update(recurringTemplateLine)
        .set({ accountId: targetAccountId })
        .where(eq(recurringTemplateLine.accountId, id));
      await tx
        .update(loan)
        .set({ principalAccountId: targetAccountId })
        .where(eq(loan.principalAccountId, id));
      await tx
        .update(loan)
        .set({ interestAccountId: targetAccountId })
        .where(eq(loan.interestAccountId, id));

      // Soft-delete / archive the source so it no longer appears in pickers.
      await tx
        .update(chartAccount)
        .set({ deletedAt: new Date(), isActive: false })
        .where(
          and(
            eq(chartAccount.id, id),
            eq(chartAccount.organizationId, ctx.organizationId)
          )
        );
    });

    // Audit both sides of the merge.
    logAudit({
      ctx,
      action: "merge",
      entityType: "chart_account",
      entityId: id,
      changes: { mergedInto: targetAccountId },
      request,
    });
    logAudit({
      ctx,
      action: "merge_target",
      entityType: "chart_account",
      entityId: targetAccountId,
      changes: { mergedFrom: id },
      request,
    });

    return NextResponse.json({
      success: true,
      sourceAccountId: id,
      targetAccountId,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return handleError(err);
  }
}
