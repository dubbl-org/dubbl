import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  bankTransaction,
  bankAccount,
  chartAccount,
  costCenter,
  taxRate,
  journalEntry,
  journalLine,
  auditLog,
} from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound, validationError } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import {
  getNextEntryNumber,
  resolveBaseRate,
  toBaseLines,
  assertBaseRateAvailable,
  ensureControlAccount,
  splitGrossTax,
} from "@/lib/api/journal-automation";
import { z } from "zod";

// Split ONE bank transaction across MULTIPLE ledger accounts in a single posting
// ("Split into categories" — distinct from /split, which settles the line across
// invoices/bills). Each allocation codes a slice of the bank amount to a chosen
// GL account, optionally tax-aware, with its own cost-center / project tracking.
//
// The whole transaction is posted as ONE balanced journal entry:
//   money in  (amount > 0): DR bank GL (full),  CR each coded account (+ tax)
//   money out (amount < 0): DR each coded account (+ tax), CR bank GL (full)
// The tax split per allocation mirrors createCategorizationJournalEntry:
//   • sale (money in):     bank gets gross; revenue gets net; tax → output VAT /
//                          US sales-tax payable liability (folded into revenue if
//                          no control account).
//   • purchase (money out): recoverable input VAT → input-VAT control; blocked /
//                           US sales tax absorbed into the coded account.
const allocationSchema = z.object({
  accountId: z.string().min(1).describe("Chart-of-accounts account to code this slice to"),
  amount: z
    .number()
    .int()
    .positive()
    .describe("Magnitude of this slice in integer cents (tax-inclusive)"),
  taxRateId: z.string().nullable().optional().describe("Optional tax rate to split out net + tax"),
  memo: z.string().nullable().optional().describe("Optional per-line memo"),
  costCenterId: z.string().nullable().optional().describe("Optional cost-center dimension"),
  projectId: z.string().nullable().optional().describe("Optional project/job dimension"),
});

const splitAccountSchema = z.object({
  allocations: z.array(allocationSchema).min(1),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:banking");

    const transaction = await db.query.bankTransaction.findFirst({
      where: eq(bankTransaction.id, id),
    });
    if (!transaction) return notFound("Bank transaction");

    const account = await db.query.bankAccount.findFirst({
      where: and(
        eq(bankAccount.id, transaction.bankAccountId),
        eq(bankAccount.organizationId, ctx.organizationId),
        notDeleted(bankAccount.deletedAt)
      ),
    });
    if (!account) return notFound("Bank transaction");

    if (transaction.status === "reconciled") {
      return NextResponse.json({ error: "Transaction already reconciled" }, { status: 400 });
    }

    if (!account.chartAccountId) {
      return validationError(
        "This bank account isn't linked to a ledger account yet. Set its ledger account in the bank account settings before categorizing transactions."
      );
    }

    const body = await request.json();
    const parsed = splitAccountSchema.parse(body);

    const abs = Math.abs(transaction.amount);
    if (abs === 0) {
      return validationError("Cannot split a zero-amount transaction.");
    }

    // The allocations must reconstruct the full transaction to the cent — a
    // partial split would leave the bank leg unbalanced against the coded legs.
    const totalAllocated = parsed.allocations.reduce((s, a) => s + a.amount, 0);
    if (totalAllocated !== abs) {
      return validationError(
        `Allocations must sum to the transaction amount (${abs} cents); got ${totalAllocated} cents.`
      );
    }

    // Verify every chosen account belongs to this org.
    const accountIds = [...new Set(parsed.allocations.map((a) => a.accountId))];
    const targets = await db.query.chartAccount.findMany({
      where: and(
        eq(chartAccount.organizationId, ctx.organizationId),
        inArray(chartAccount.id, accountIds)
      ),
      columns: { id: true },
    });
    if (targets.length !== accountIds.length) return notFound("Account");

    // Verify any referenced cost centers belong to this org.
    const costCenterIds = [
      ...new Set(parsed.allocations.map((a) => a.costCenterId).filter((v): v is string => !!v)),
    ];
    if (costCenterIds.length > 0) {
      const ccs = await db.query.costCenter.findMany({
        where: and(
          eq(costCenter.organizationId, ctx.organizationId),
          inArray(costCenter.id, costCenterIds),
          notDeleted(costCenter.deletedAt)
        ),
        columns: { id: true },
      });
      if (ccs.length !== costCenterIds.length) return notFound("Cost center");
    }

    // Load any referenced tax rates (org-scoped) so we can split net/tax per leg.
    const taxRateIds = [
      ...new Set(parsed.allocations.map((a) => a.taxRateId).filter((v): v is string => !!v)),
    ];
    const taxRows = taxRateIds.length
      ? await db.query.taxRate.findMany({
          where: and(eq(taxRate.organizationId, ctx.organizationId), inArray(taxRate.id, taxRateIds)),
          columns: { id: true, rate: true, kind: true, recoverablePercent: true },
        })
      : [];
    if (taxRows.length !== taxRateIds.length) return notFound("Tax rate");
    const taxById = new Map(taxRows.map((t) => [t.id, t]));

    const currencyCode = transaction.currencyCode || account.currencyCode;

    // Pre-flight the FX rate so a missing rate fails cleanly (422) before writes.
    await assertBaseRateAvailable(ctx.organizationId, currencyCode, transaction.date);

    const moneyIn = transaction.amount > 0;
    const bankGlAccountId = account.chartAccountId;
    const reference = transaction.reference || transaction.description;

    const { entry } = await db.transaction(async (tx) => {
      const entryNumber = await getNextEntryNumber(ctx.organizationId, tx);
      const { currency, rate } = await resolveBaseRate(
        ctx.organizationId,
        currencyCode,
        transaction.date
      );

      const [entry] = await tx
        .insert(journalEntry)
        .values({
          organizationId: ctx.organizationId,
          entryNumber,
          date: transaction.date,
          description: transaction.description,
          reference,
          status: "posted",
          sourceType: "bank_categorization_split",
          postedAt: new Date(),
          createdBy: ctx.userId,
        })
        .returning();

      const lines: (typeof journalLine.$inferInsert)[] = [];

      // Bank leg for the full amount: DR on money in, CR on money out.
      lines.push({
        journalEntryId: entry.id,
        accountId: bankGlAccountId,
        description: transaction.description,
        debitAmount: moneyIn ? abs : 0,
        creditAmount: moneyIn ? 0 : abs,
      });

      // Coded leg(s) — one (or one + tax) per allocation — mirroring the
      // tax-splitting in createCategorizationJournalEntry. Tracking dimensions
      // (cost center / project) attach to the coded leg, not the tax leg.
      for (const alloc of parsed.allocations) {
        const description = alloc.memo?.trim() || transaction.description;
        const dims = {
          costCenterId: alloc.costCenterId || null,
          projectId: alloc.projectId || null,
        };
        const gross = alloc.amount;
        const taxRow = alloc.taxRateId ? taxById.get(alloc.taxRateId) ?? null : null;

        const noTaxLeg =
          !taxRow ||
          taxRow.rate <= 0 ||
          taxRow.kind === "exempt" ||
          taxRow.kind === "no_vat" ||
          taxRow.kind === "reverse_charge";
        const isUsSalesTax = taxRow?.kind === "sales_tax_us";

        if (noTaxLeg || (!moneyIn && isUsSalesTax)) {
          // Plain leg. US sales tax on a PURCHASE is non-recoverable, so the
          // whole gross is absorbed into the chosen account.
          lines.push({
            journalEntryId: entry.id,
            accountId: alloc.accountId,
            description,
            debitAmount: moneyIn ? 0 : gross,
            creditAmount: moneyIn ? gross : 0,
            ...dims,
          });
        } else if (moneyIn) {
          // Sale: revenue gets net; tax collected is a liability (output VAT or
          // US sales-tax payable). Fold tax into revenue if no control account.
          const taxAmt = Math.round((gross * taxRow!.rate) / (10000 + taxRow!.rate));
          const net = gross - taxAmt;
          const control = await ensureControlAccount(
            ctx.organizationId,
            isUsSalesTax ? "salesTaxPayable" : "outputVat",
            currency,
            tx
          );
          if (control && taxAmt > 0) {
            lines.push({
              journalEntryId: entry.id,
              accountId: alloc.accountId,
              description,
              debitAmount: 0,
              creditAmount: net,
              ...dims,
            });
            lines.push({
              journalEntryId: entry.id,
              accountId: control.id,
              description,
              debitAmount: 0,
              creditAmount: taxAmt,
            });
          } else {
            lines.push({
              journalEntryId: entry.id,
              accountId: alloc.accountId,
              description,
              debitAmount: 0,
              creditAmount: gross,
              ...dims,
            });
          }
        } else {
          // Purchase with VAT/GST: reclaim the recoverable slice to input VAT,
          // absorb the blocked slice into the coded account. Fold recoverable in
          // too if there's no input-VAT control account.
          const { net, recoverableTax, absorbedTax } = splitGrossTax(
            gross,
            taxRow!.rate,
            taxRow!.recoverablePercent
          );
          const inputControl =
            recoverableTax > 0
              ? await ensureControlAccount(ctx.organizationId, "inputVat", currency, tx)
              : null;
          if (inputControl && recoverableTax > 0) {
            lines.push({
              journalEntryId: entry.id,
              accountId: alloc.accountId,
              description,
              debitAmount: net + absorbedTax,
              creditAmount: 0,
              ...dims,
            });
            lines.push({
              journalEntryId: entry.id,
              accountId: inputControl.id,
              description,
              debitAmount: recoverableTax,
              creditAmount: 0,
            });
          } else {
            lines.push({
              journalEntryId: entry.id,
              accountId: alloc.accountId,
              description,
              debitAmount: gross,
              creditAmount: 0,
              ...dims,
            });
          }
        }
      }

      // Convert to base (balance-preserving) and stamp currency/rate on each leg.
      await tx.insert(journalLine).values(toBaseLines(lines, currency, rate));

      // The transaction-level account/tax stamp is only meaningful for a single
      // category; for a multi-account split leave them null and rely on the
      // journal entry for the breakdown.
      await tx
        .update(bankTransaction)
        .set({
          status: "reconciled",
          accountId: null,
          taxRateId: null,
          journalEntryId: entry.id,
        })
        .where(eq(bankTransaction.id, id));

      return { entry };
    });

    await db.insert(auditLog).values({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: "split_categorized",
      entityType: "bank_transaction",
      entityId: id,
      changes: {
        journalEntryId: entry.id,
        amount: transaction.amount,
        allocations: parsed.allocations.map((a) => ({
          accountId: a.accountId,
          amount: a.amount,
          taxRateId: a.taxRateId || null,
          costCenterId: a.costCenterId || null,
          projectId: a.projectId || null,
        })),
      },
    });

    return NextResponse.json({ journalEntryId: entry.id }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
