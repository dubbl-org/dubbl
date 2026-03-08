import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  loan,
  loanSchedule,
  journalEntry,
  journalLine,
  bankAccount,
} from "@/lib/db/schema";
import { eq, and, asc, sql } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound, validationError } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";

async function getNextEntryNumber(organizationId: string) {
  const [maxResult] = await db
    .select({
      max: sql<number>`coalesce(max(${journalEntry.entryNumber}), 0)`,
    })
    .from(journalEntry)
    .where(eq(journalEntry.organizationId, organizationId));
  return (maxResult?.max || 0) + 1;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:invoices");

    // Get loan and verify ownership
    const found = await db.query.loan.findFirst({
      where: and(
        eq(loan.id, id),
        eq(loan.organizationId, ctx.organizationId),
        notDeleted(loan.deletedAt)
      ),
    });

    if (!found) return notFound("Loan");

    if (found.status !== "active") {
      return validationError("Loan is not active");
    }

    if (!found.principalAccountId || !found.interestAccountId) {
      return validationError("Loan is missing principal or interest account configuration");
    }

    // Find first unposted schedule entry
    const nextEntry = await db.query.loanSchedule.findFirst({
      where: and(
        eq(loanSchedule.loanId, id),
        eq(loanSchedule.posted, false)
      ),
      orderBy: asc(loanSchedule.sortOrder),
    });

    if (!nextEntry) {
      return validationError("No unposted schedule entries remaining");
    }

    // Determine bank account for credit side
    let creditAccountId: string | null = null;
    if (found.bankAccountId) {
      const bank = await db.query.bankAccount.findFirst({
        where: eq(bankAccount.id, found.bankAccountId),
      });
      creditAccountId = bank?.chartAccountId || null;
    }

    if (!creditAccountId) {
      return validationError("Loan has no bank account or bank account has no linked chart account");
    }

    // Create journal entry
    const entryNumber = await getNextEntryNumber(ctx.organizationId);
    const today = new Date().toISOString().slice(0, 10);

    const [je] = await db
      .insert(journalEntry)
      .values({
        organizationId: ctx.organizationId,
        entryNumber,
        date: nextEntry.date || today,
        description: `Loan payment #${nextEntry.periodNumber} for ${found.name}`,
        reference: `LOAN-${found.name}-${nextEntry.periodNumber}`,
        status: "posted",
        sourceType: "loan",
        sourceId: found.id,
        createdBy: ctx.userId,
        postedAt: new Date(),
      })
      .returning();

    // Journal lines:
    // DR principal account (liability - reduces the loan balance)
    // DR interest account (expense - interest cost)
    // CR bank account (asset - cash going out)
    const lines = [];

    if (nextEntry.principalAmount > 0) {
      lines.push({
        journalEntryId: je.id,
        accountId: found.principalAccountId!,
        description: `Loan principal payment #${nextEntry.periodNumber}`,
        debitAmount: nextEntry.principalAmount,
        creditAmount: 0,
      });
    }

    if (nextEntry.interestAmount > 0) {
      lines.push({
        journalEntryId: je.id,
        accountId: found.interestAccountId!,
        description: `Loan interest payment #${nextEntry.periodNumber}`,
        debitAmount: nextEntry.interestAmount,
        creditAmount: 0,
      });
    }

    lines.push({
      journalEntryId: je.id,
      accountId: creditAccountId,
      description: `Loan payment #${nextEntry.periodNumber} - ${found.name}`,
      debitAmount: 0,
      creditAmount: nextEntry.totalPayment,
    });

    await db.insert(journalLine).values(lines);

    // Update schedule entry as posted
    await db
      .update(loanSchedule)
      .set({ posted: true, journalEntryId: je.id })
      .where(eq(loanSchedule.id, nextEntry.id));

    // Check if all entries are now posted
    const remainingUnposted = await db.query.loanSchedule.findFirst({
      where: and(
        eq(loanSchedule.loanId, id),
        eq(loanSchedule.posted, false)
      ),
    });

    if (!remainingUnposted) {
      await db
        .update(loan)
        .set({ status: "paid_off", updatedAt: new Date() })
        .where(eq(loan.id, id));
    }

    return NextResponse.json({
      entry: { ...nextEntry, posted: true, journalEntryId: je.id },
      journalEntry: je,
      loanStatus: remainingUnposted ? "active" : "paid_off",
    });
  } catch (err) {
    return handleError(err);
  }
}
