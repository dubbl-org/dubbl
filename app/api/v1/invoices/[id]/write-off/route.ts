import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { invoice, journalEntry, journalLine } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound, validationError } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { logAudit } from "@/lib/api/audit";
import { assertNotLocked } from "@/lib/api/period-lock";
import {
  getNextEntryNumber,
  findAccountByCode,
  ensureAccountByCode,
  resolveBaseRate,
  toBaseLines,
} from "@/lib/api/journal-automation";
import { z } from "zod";

/**
 * Bad-debt handling for a receivable.
 *
 * action "write-off" (default): the invoice is deemed uncollectible. Removes the
 * outstanding AR and recognises the loss.
 *   • direct method (default): DR Bad Debt Expense (6500) / CR Accounts Receivable (1200)
 *   • allowance method:        DR Allowance for Doubtful Accounts (1290) / CR Accounts Receivable (1200)
 * Sets invoice.writtenOffAt and status = "void"; clears amountDue.
 *
 * action "recover": cash arrives on a debt previously written off (direct method).
 *   DR Bank GL (bankAccountCode, default 1100) / CR Bad Debt Recovered (4400)
 * for the supplied `amount` (defaults to the amount that was written off). Does
 * not change invoice status — it's already void/written-off — but records the
 * recovery on the ledger.
 *
 * All amounts are integer cents. Posts in the invoice currency, converted to base.
 */
const bodySchema = z
  .object({
    action: z.enum(["write-off", "recover"]).default("write-off"),
    // write-off: which method to use for the loss side.
    method: z.enum(["direct", "allowance"]).default("direct"),
    // recover: cash recovered (cents) + which bank GL account it landed in.
    amount: z.number().int().positive().optional(),
    bankAccountCode: z.string().optional(),
  })
  .default({ action: "write-off", method: "direct" });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "approve:invoices");

    const rawBody = await request.json().catch(() => ({}));
    const body = bodySchema.parse(rawBody);

    const found = await db.query.invoice.findFirst({
      where: and(
        eq(invoice.id, id),
        eq(invoice.organizationId, ctx.organizationId),
        notDeleted(invoice.deletedAt)
      ),
    });

    if (!found) return notFound("Invoice");

    // Don't post bad-debt entries into a locked/closed period.
    await assertNotLocked(ctx.organizationId, found.issueDate, ctx);

    const { base, currency, rate } = await resolveBaseRate(
      ctx.organizationId,
      found.currencyCode,
      found.issueDate
    );

    // AR control account is required for either action.
    const arAccount = await findAccountByCode(ctx.organizationId, "1200");
    if (!arAccount) {
      return validationError("Accounts Receivable account (1200) not found");
    }

    if (body.action === "recover") {
      // Cash recovery of a previously written-off debt.
      if (!found.writtenOffAt) {
        return validationError("Invoice has not been written off; nothing to recover");
      }
      const amount = body.amount ?? found.total;
      if (amount <= 0) return validationError("Recovery amount must be positive");

      // Resolve the bank/cash account the recovery lands in. With no code given,
      // fall back to the standard checking account, creating it on demand so the
      // recovery never dead-ends. An explicitly-supplied code must already exist
      // (don't fabricate a wrong account from a typo).
      const bankCode = body.bankAccountCode || "1100";
      const bankAccount =
        (await findAccountByCode(ctx.organizationId, bankCode)) ??
        (!body.bankAccountCode
          ? await ensureAccountByCode(
              ctx.organizationId,
              { code: "1100", name: "Checking Account", type: "asset", subType: "bank" },
              base
            )
          : null);
      if (!bankAccount) {
        return validationError(`Bank account (${bankCode}) not found`);
      }
      const recoveredAccount = await ensureAccountByCode(
        ctx.organizationId,
        { code: "4400", name: "Bad Debt Recovered", type: "revenue", subType: "non_operating" },
        base
      );
      if (!recoveredAccount) {
        return validationError("Could not resolve Bad Debt Recovered account (4400)");
      }

      await db.transaction(async (tx) => {
        const entryNumber = await getNextEntryNumber(ctx.organizationId, tx);
        const [entry] = await tx
          .insert(journalEntry)
          .values({
            organizationId: ctx.organizationId,
            entryNumber,
            date: found.issueDate,
            description: `Bad debt recovery for invoice ${found.invoiceNumber}`,
            reference: found.invoiceNumber,
            status: "posted",
            sourceType: "bad_debt_recovery",
            sourceId: found.id,
            postedAt: new Date(),
            createdBy: ctx.userId,
          })
          .returning();

        const mk = (accountId: string, debit: number, credit: number) => ({
          journalEntryId: entry.id,
          accountId,
          description: `Bad debt recovery ${found.invoiceNumber}`,
          debitAmount: debit,
          creditAmount: credit,
        });

        // DR Bank / CR Bad Debt Recovered, converted document→base currency.
        await tx.insert(journalLine).values(
          toBaseLines(
            [mk(bankAccount.id, amount, 0), mk(recoveredAccount.id, 0, amount)],
            currency,
            rate
          )
        );
      });

      logAudit({
        ctx,
        action: "bad-debt-recover",
        entityType: "invoice",
        entityId: id,
        changes: { amount },
        request,
      });

      return NextResponse.json({ invoice: found, recovered: amount });
    }

    // action === "write-off"
    if (found.writtenOffAt) {
      return NextResponse.json({ error: "Invoice already written off" }, { status: 400 });
    }
    if (found.status === "void") {
      return NextResponse.json({ error: "Cannot write off a voided invoice" }, { status: 400 });
    }
    if (found.status === "paid") {
      return NextResponse.json({ error: "Invoice is fully paid; nothing to write off" }, { status: 400 });
    }

    // Write off whatever is still outstanding (fall back to total for older rows
    // where amountDue was never populated).
    const amountDue = found.amountDue > 0 ? found.amountDue : found.total - found.amountPaid;
    if (amountDue <= 0) {
      return validationError("Nothing outstanding to write off");
    }

    // Loss side: direct → Bad Debt Expense (6500); allowance → Allowance for
    // Doubtful Accounts (1290) (the allowance was previously provided for).
    const lossAccount =
      body.method === "allowance"
        ? await ensureAccountByCode(
            ctx.organizationId,
            { code: "1290", name: "Allowance for Doubtful Accounts", type: "asset", subType: "current" },
            base
          )
        : await ensureAccountByCode(
            ctx.organizationId,
            { code: "6500", name: "Bad Debt Expense", type: "expense", subType: "operating" },
            base
          );
    if (!lossAccount) {
      return validationError("Could not resolve the bad-debt write-off account");
    }

    const [updated] = await db.transaction(async (tx) => {
      const entryNumber = await getNextEntryNumber(ctx.organizationId, tx);
      const [entry] = await tx
        .insert(journalEntry)
        .values({
          organizationId: ctx.organizationId,
          entryNumber,
          date: found.issueDate,
          description: `Bad debt write-off for invoice ${found.invoiceNumber}`,
          reference: found.invoiceNumber,
          status: "posted",
          sourceType: "bad_debt_write_off",
          sourceId: found.id,
          postedAt: new Date(),
          createdBy: ctx.userId,
        })
        .returning();

      const mk = (accountId: string, debit: number, credit: number) => ({
        journalEntryId: entry.id,
        accountId,
        description: `Bad debt write-off ${found.invoiceNumber}`,
        debitAmount: debit,
        creditAmount: credit,
      });

      // DR loss account / CR Accounts Receivable, converted document→base currency.
      await tx.insert(journalLine).values(
        toBaseLines(
          [mk(lossAccount.id, amountDue, 0), mk(arAccount.id, 0, amountDue)],
          currency,
          rate
        )
      );

      return tx
        .update(invoice)
        .set({
          status: "void",
          writtenOffAt: new Date(),
          amountDue: 0,
          updatedAt: new Date(),
        })
        .where(eq(invoice.id, id))
        .returning();
    });

    logAudit({
      ctx,
      action: "bad-debt-write-off",
      entityType: "invoice",
      entityId: id,
      changes: { previousStatus: found.status, method: body.method, amountWrittenOff: amountDue },
      request,
    });

    return NextResponse.json({ invoice: updated });
  } catch (err) {
    return handleError(err);
  }
}
