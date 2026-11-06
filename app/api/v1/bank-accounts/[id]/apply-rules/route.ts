import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bankAccount } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { notDeleted } from "@/lib/db/soft-delete";
import { applyBankRulesToAccount } from "@/lib/api/bank-rules";

/**
 * POST /api/v1/bank-accounts/[id]/apply-rules
 *
 * Runs the organization's active bank rules over EXISTING transactions in this
 * bank account that are still unreconciled and have no accountId yet. Rules
 * that categorize automatically (autoReconcile) or split post the
 * categorization journal entry and move the line to Done, exactly like the
 * manual Categorize action; other matches only fill in the category / contact
 * / tax as a suggestion. See applyBankRulesToAccount.
 *
 * Returns { applied, reconciled, split, skipped } counts: `skipped` lines
 * matched a posting rule but couldn't be posted (locked period, missing
 * exchange rate) and were left as suggestions.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:banking");

    // Verify bank account belongs to organization
    const account = await db.query.bankAccount.findFirst({
      where: and(
        eq(bankAccount.id, id),
        eq(bankAccount.organizationId, ctx.organizationId),
        notDeleted(bankAccount.deletedAt)
      ),
    });

    if (!account) return notFound("Bank account");

    const result = await applyBankRulesToAccount(ctx.organizationId, id, ctx.userId);

    await logAudit({
      ctx,
      action: "apply_rules",
      entityType: "bank_account",
      entityId: id,
      changes: { applied: result.applied, reconciled: result.reconciled, split: result.split, skipped: result.skipped },
      request,
    });

    return NextResponse.json(result);
  } catch (err) {
    return handleError(err);
  }
}
