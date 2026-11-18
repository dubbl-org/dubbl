import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { matchExistingExpense, unmatchExpense, MatchExpenseConflict } from "@/lib/api/match-expense-op";

/**
 * Match a bank transaction to an EXISTING receipt-backed expense claim
 * (founder current-account funding). Founder pays the vendor personally:
 * the company keeps owing the founder, company cash does not change.
 *
 * POST /api/v1/bank-transactions/:id/match-expense
 *   { expenseClaimId, date?, rateOverride? }
 *   - expenseClaimId: an existing draft claim, one item, categorized
 *   - date: accounting date for the journal; defaults to the transaction date
 *   - rateOverride: optional historical rate, integer scale 1,000,000
 *     (1.234567 = 1234567); without it the stored rate is used and a missing
 *     rate is a 422 before any write
 *
 * Money units: transaction.amount and claim.totalAmount are integer minor
 * units (EUR 13.23 = 1323). The transaction is negative for money out; the
 * claim is positive. Amounts and currency must match exactly.
 *
 * DELETE /api/v1/bank-transactions/:id/match-expense
 *   { expenseClaimId, reason? }
 *   Posts a reversing journal entry on the original date, restores the claim
 *   to draft and the transaction to unreconciled. Documents are untouched.
 *   Period locks apply to both operations.
 */

const postSchema = z.object({
  expenseClaimId: z.string().uuid(),
  date: z.string().min(1).optional(),
  rateOverride: z.number().int().positive().optional(),
});

const deleteSchema = z.object({
  expenseClaimId: z.string().uuid(),
  reason: z.string().max(500).optional(),
});

function conflictResponse(err: MatchExpenseConflict) {
  if (err.code === "not_found") return notFound(err.message);
  return NextResponse.json({ error: err.message, code: err.code }, { status: 409 });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:banking");

    const parsed = postSchema.parse(await request.json());
    const result = await matchExistingExpense(ctx, {
      transactionId: id,
      expenseClaimId: parsed.expenseClaimId,
      date: parsed.date,
      rateOverride: parsed.rateOverride,
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof MatchExpenseConflict) return conflictResponse(err);
    return handleError(err);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:banking");

    const parsed = deleteSchema.parse(await request.json());
    const result = await unmatchExpense(ctx, {
      transactionId: id,
      expenseClaimId: parsed.expenseClaimId,
      reason: parsed.reason,
    });
    return NextResponse.json({ ...result, undone: true });
  } catch (err) {
    if (err instanceof MatchExpenseConflict) return conflictResponse(err);
    return handleError(err);
  }
}
