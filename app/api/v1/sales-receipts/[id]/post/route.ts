import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  salesReceipt,
  bankAccount,
  chartAccount,
  journalEntry,
  journalLine,
} from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound, validationError } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { assertNotLocked } from "@/lib/api/period-lock";
import { logAudit } from "@/lib/api/audit";
import {
  getNextEntryNumber,
  resolveBaseRate,
  toBaseLines,
  assertBaseRateAvailable,
  ensureControlAccount,
  createCogsJournalEntry,
} from "@/lib/api/journal-automation";
import { ensureBankLedgerAccount } from "@/lib/api/bank-ledger";

/**
 * Post a draft sales receipt (cash sale) to the GL.
 *
 * A sales receipt settles immediately and never touches Accounts Receivable.
 * The single posted entry is, in document currency:
 *   DR  Cash account (the bank account's linked GL, or the chosen 1250-style
 *       deposit account)                                            = total
 *   CR  Revenue (per line, line.amount net)                         = subtotal
 *   CR  Output VAT (2200)                                           = taxTotal
 * then converted to base currency (balance-preserving) via toBaseLines.
 *
 * Separately, COGS is posted for any stock lines (relieve inventory) via
 * createCogsJournalEntry. Everything commits in one db.transaction.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "approve:invoices");

    const found = await db.query.salesReceipt.findFirst({
      where: and(
        eq(salesReceipt.id, id),
        eq(salesReceipt.organizationId, ctx.organizationId),
        notDeleted(salesReceipt.deletedAt)
      ),
      with: { lines: true },
    });

    if (!found) return notFound("Sales receipt");
    if (found.status !== "draft") {
      return validationError("Only draft sales receipts can be posted");
    }

    await assertNotLocked(ctx.organizationId, found.date);

    // Resolve where the cash lands. Prefer the bank account's linked GL account;
    // fall back to the chosen deposit chart account; finally the Undeposited
    // Funds control account (1250). At least one must resolve.
    let cashAccountId: string | null = null;
    if (found.bankAccountId) {
      const acct = await db.query.bankAccount.findFirst({
        where: and(
          eq(bankAccount.id, found.bankAccountId),
          eq(bankAccount.organizationId, ctx.organizationId),
          notDeleted(bankAccount.deletedAt)
        ),
        columns: {
          id: true,
          accountName: true,
          accountType: true,
          currencyCode: true,
          chartAccountId: true,
        },
      });
      if (!acct) return notFound("Bank account");
      // Connect the bank account to its ledger account automatically (older
      // accounts self-heal on first use) so posting never hits a dead end.
      cashAccountId = await ensureBankLedgerAccount(ctx.organizationId, acct);
    } else if (found.depositAccountId) {
      const acct = await db.query.chartAccount.findFirst({
        where: and(
          eq(chartAccount.id, found.depositAccountId),
          eq(chartAccount.organizationId, ctx.organizationId)
        ),
        columns: { id: true },
      });
      if (!acct) return notFound("Deposit account");
      cashAccountId = acct.id;
    }

    // Foreign-currency receipts need a base rate to post. Pre-flight before any
    // writes so a missing rate returns a clean 422 with no side effects.
    await assertBaseRateAvailable(ctx.organizationId, found.currencyCode, found.date);

    const { currency, rate, base } = await resolveBaseRate(
      ctx.organizationId,
      found.currencyCode,
      found.date
    );

    const updated = await db.transaction(async (tx) => {
      // Undeposited Funds (1250) fallback when no bank/deposit account chosen.
      if (!cashAccountId) {
        const undeposited = await ensureControlAccount(
          ctx.organizationId,
          "undepositedFunds",
          base,
          tx
        );
        if (!undeposited) {
          throw new Error("Could not resolve a cash account to post the sale to");
        }
        cashAccountId = undeposited.id;
      }

      const entryNumber = await getNextEntryNumber(ctx.organizationId, tx);
      const [entry] = await tx
        .insert(journalEntry)
        .values({
          organizationId: ctx.organizationId,
          entryNumber,
          date: found.date,
          description: `Sales receipt ${found.receiptNumber}`,
          reference: found.receiptNumber,
          status: "posted",
          sourceType: "sales_receipt",
          sourceId: found.id,
          postedAt: new Date(),
          createdBy: ctx.userId,
        })
        .returning();

      const lines: (typeof journalLine.$inferInsert)[] = [];

      // CR Revenue per line (net amount).
      for (const line of found.lines) {
        if (line.accountId && line.amount > 0) {
          lines.push({
            journalEntryId: entry.id,
            accountId: line.accountId,
            description: `Sales receipt ${found.receiptNumber}`,
            debitAmount: 0,
            creditAmount: line.amount,
          });
        }
      }

      // CR Output VAT (2200) for the collected tax.
      if (found.taxTotal > 0) {
        const outputVat = await ensureControlAccount(
          ctx.organizationId,
          "outputVat",
          base,
          tx
        );
        if (outputVat) {
          lines.push({
            journalEntryId: entry.id,
            accountId: outputVat.id,
            description: `Tax on ${found.receiptNumber}`,
            debitAmount: 0,
            creditAmount: found.taxTotal,
          });
        }
      }

      // DR Cash for the sum of the offsetting credit legs, so the entry balances
      // in document currency even if a line lacks an account or the VAT account
      // is missing — otherwise FX conversion would scale the imbalance.
      const cashTotal = lines.reduce((s, l) => s + (l.creditAmount ?? 0), 0);
      if (cashTotal > 0) {
        lines.unshift({
          journalEntryId: entry.id,
          accountId: cashAccountId!,
          description: `Sales receipt ${found.receiptNumber}`,
          debitAmount: cashTotal,
          creditAmount: 0,
        });
        await tx.insert(journalLine).values(toBaseLines(lines, currency, rate));
      }

      // Cost of goods sold: relieve inventory + post COGS for any stock lines.
      const stockLines = found.lines.filter((l) => l.inventoryItemId);
      if (stockLines.length > 0) {
        await createCogsJournalEntry(
          { organizationId: ctx.organizationId, userId: ctx.userId },
          {
            reference: found.receiptNumber,
            date: found.date,
            currencyCode: found.currencyCode,
            lines: stockLines.map((l) => ({
              inventoryItemId: l.inventoryItemId as string,
              quantity: l.quantity,
              warehouseId: l.warehouseId,
            })),
          },
          tx
        );
      }

      const [row] = await tx
        .update(salesReceipt)
        .set({
          status: "paid",
          journalEntryId: entry.id,
          updatedAt: new Date(),
        })
        .where(eq(salesReceipt.id, id))
        .returning();

      return row;
    });

    logAudit({
      ctx,
      action: "post",
      entityType: "sales_receipt",
      entityId: id,
      changes: { previousStatus: found.status },
      request,
    });

    return NextResponse.json({ salesReceipt: updated });
  } catch (err) {
    return handleError(err);
  }
}
