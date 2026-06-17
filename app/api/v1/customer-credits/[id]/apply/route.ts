import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  customerCredit,
  invoice,
  payment,
  paymentAllocation,
  journalEntry,
  journalLine,
} from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound, validationError } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { notDeleted } from "@/lib/db/soft-delete";
import { assertNotLocked } from "@/lib/api/period-lock";
import { getNextNumber } from "@/lib/api/numbering";
import {
  getNextEntryNumber,
  resolveBaseRate,
  toBaseLines,
  assertBaseRateAvailable,
  findAccountByCode,
  ensureControlAccount,
} from "@/lib/api/journal-automation";
import { z } from "zod";

const applySchema = z.object({
  invoiceId: z.string().min(1),
  amount: z.number().int().positive().describe("Amount of the credit to apply, in integer cents."),
  // Date the credit is applied / journal posts. Defaults to today.
  date: z.string().optional(),
});

/**
 * Apply an open customer credit (prepayment / deposit / overpayment) to an
 * invoice.
 *
 * Unlike applying a credit NOTE (which already relieved AR at issue and is a
 * pure open-item offset), a customer credit sits on the Customer Deposits (2410)
 * liability. Applying it must MOVE that liability onto the invoice's AR:
 *   DR  Customer Deposits (2410)   = amount
 *   CR  Accounts Receivable (1200) = amount
 * and record a paymentAllocation so the invoice's open-item ledger ties out.
 * The credit's amountRemaining is decremented and the invoice balances/status
 * are updated. All atomic.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:payments");

    const body = await request.json();
    const parsed = applySchema.parse(body);
    const applyDate = parsed.date || new Date().toISOString().split("T")[0];

    await assertNotLocked(ctx.organizationId, applyDate, ctx);

    const found = await db.query.customerCredit.findFirst({
      where: and(
        eq(customerCredit.id, id),
        eq(customerCredit.organizationId, ctx.organizationId),
        notDeleted(customerCredit.deletedAt)
      ),
    });

    if (!found) return notFound("Customer credit");
    if (found.status !== "open") {
      return validationError("Only open customer credits can be applied");
    }
    if (parsed.amount > found.amountRemaining) {
      return validationError("Amount exceeds the credit's remaining balance");
    }

    const foundInvoice = await db.query.invoice.findFirst({
      where: and(
        eq(invoice.id, parsed.invoiceId),
        eq(invoice.organizationId, ctx.organizationId),
        notDeleted(invoice.deletedAt)
      ),
    });

    if (!foundInvoice) return notFound("Invoice");
    if (foundInvoice.status === "draft" || foundInvoice.status === "void") {
      return validationError("Cannot apply a credit to this invoice status");
    }
    if (foundInvoice.currencyCode !== found.currencyCode) {
      return validationError(
        "Credit currency must match the invoice currency"
      );
    }
    if (parsed.amount > foundInvoice.amountDue) {
      return validationError("Amount exceeds the invoice amount due");
    }

    // Foreign-currency posting needs a base rate. Pre-flight first.
    await assertBaseRateAvailable(ctx.organizationId, found.currencyCode, applyDate);

    const { currency, rate, base } = await resolveBaseRate(
      ctx.organizationId,
      found.currencyCode,
      applyDate
    );

    // New credit balances/status.
    const newRemaining = found.amountRemaining - parsed.amount;
    const creditStatus = newRemaining <= 0 ? "applied" : "open";

    // New invoice balances/status.
    const newAmountPaid = foundInvoice.amountPaid + parsed.amount;
    const newAmountDue = foundInvoice.total - newAmountPaid;
    const invoiceStatus = newAmountDue <= 0 ? "paid" : "partial";

    // Carrier payment number for the allocation rows.
    const paymentNumber = await getNextNumber(
      ctx.organizationId,
      "payment",
      "payment_number",
      "PAY"
    );

    const result = await db.transaction(async (tx) => {
      // Resolve AR (1200) and Customer Deposits (2410).
      const arAccount = await findAccountByCode(ctx.organizationId, "1200", tx);
      if (!arAccount) {
        throw new Error("Accounts Receivable account (1200) not found");
      }
      const deposits = await ensureControlAccount(
        ctx.organizationId,
        "customerDeposits",
        base,
        tx
      );
      if (!deposits) {
        throw new Error("Could not resolve the Customer Deposits account");
      }

      const entryNumber = await getNextEntryNumber(ctx.organizationId, tx);
      const description = `Apply customer credit to invoice ${foundInvoice.invoiceNumber}`;
      const [entry] = await tx
        .insert(journalEntry)
        .values({
          organizationId: ctx.organizationId,
          entryNumber,
          date: applyDate,
          description,
          reference: foundInvoice.invoiceNumber,
          status: "posted",
          sourceType: "customer_credit_application",
          sourceId: found.id,
          postedAt: new Date(),
          createdBy: ctx.userId,
        })
        .returning();

      // DR Customer Deposits / CR Accounts Receivable (document currency → base).
      const lines: (typeof journalLine.$inferInsert)[] = [
        {
          journalEntryId: entry.id,
          accountId: deposits.id,
          description,
          debitAmount: parsed.amount,
          creditAmount: 0,
        },
        {
          journalEntryId: entry.id,
          accountId: arAccount.id,
          description,
          debitAmount: 0,
          creditAmount: parsed.amount,
        },
      ];
      await tx.insert(journalLine).values(toBaseLines(lines, currency, rate));

      // Carrier payment row + allocations so the invoice open-item ledger ties
      // out. documentType 'prepayment' marks the credit side; 'invoice' the
      // settled invoice.
      //
      // SINGLE cash recognition — no double count:
      //   • Cash was recognized ONCE, when the credit was CREATED (DR Cash /
      //     CR Customer Deposits). That entry posts to the cash GL but is NOT a
      //     `payment` row, so it never appears on the contact statement and is
      //     only ever picked up by GL-derived cash reports.
      //   • This application posts DR Customer Deposits / CR AR — it moves the
      //     liability onto AR and touches NO cash account, so it adds no second
      //     cash recognition to any GL-derived report.
      //   • The carrier below is a zero-cash `received` row whose sole purpose is
      //     to drive the open-item ledger and the AR contact statement: it is the
      //     ONLY thing on the statement that reflects this credit relieving the
      //     invoice's balance (the credit's creation is invisible there). It must
      //     therefore STAY type 'received' and must NOT be added to the
      //     statement's carrier-exclusion list — doing so would leave the
      //     invoice's balance overstated forever. (Contrast credit-NOTE carriers,
      //     which ARE excluded because the credit note already shows as its own
      //     statement line.) The 'prepayment' documentType marks this as a
      //     non-cash carrier for any cash report that wants to exclude it.
      const [createdPayment] = await tx
        .insert(payment)
        .values({
          organizationId: ctx.organizationId,
          contactId: found.contactId,
          paymentNumber,
          type: "received",
          date: applyDate,
          amount: parsed.amount,
          method: "other",
          reference: foundInvoice.invoiceNumber,
          notes: `Customer credit applied to invoice ${foundInvoice.invoiceNumber}`,
          currencyCode: found.currencyCode,
          journalEntryId: entry.id,
          createdBy: ctx.userId,
        })
        .returning();

      await tx.insert(paymentAllocation).values([
        {
          paymentId: createdPayment.id,
          documentType: "prepayment",
          documentId: id,
          amount: parsed.amount,
        },
        {
          paymentId: createdPayment.id,
          documentType: "invoice",
          documentId: parsed.invoiceId,
          amount: parsed.amount,
        },
      ]);

      const [updatedCredit] = await tx
        .update(customerCredit)
        .set({
          amountRemaining: Math.max(0, newRemaining),
          status: creditStatus,
          updatedAt: new Date(),
        })
        .where(eq(customerCredit.id, id))
        .returning();

      const [updatedInvoice] = await tx
        .update(invoice)
        .set({
          amountPaid: newAmountPaid,
          amountDue: Math.max(0, newAmountDue),
          status: invoiceStatus,
          paidAt: invoiceStatus === "paid" ? new Date() : null,
          updatedAt: new Date(),
        })
        .where(eq(invoice.id, parsed.invoiceId))
        .returning();

      return { updatedCredit, updatedInvoice };
    });

    logAudit({
      ctx,
      action: "apply",
      entityType: "customer_credit",
      entityId: id,
      changes: { previousStatus: found.status },
      request,
    });

    return NextResponse.json({
      customerCredit: result.updatedCredit,
      invoice: result.updatedInvoice,
    });
  } catch (err) {
    return handleError(err);
  }
}
