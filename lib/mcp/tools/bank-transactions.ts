import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import {
  bankTransaction,
  bankAccount,
  bankReconciliation,
  chartAccount,
  costCenter,
  taxRate,
  invoice,
  bill,
  payment,
  paymentAllocation,
  journalEntry,
  journalLine,
  auditLog,
} from "@/lib/db/schema";
import {
  eq,
  and,
  desc,
  asc,
  sql,
  inArray,
  isNull,
  ne,
  gte,
  lte,
} from "drizzle-orm";
import { notDeleted } from "@/lib/db/soft-delete";
import { requireRole } from "@/lib/api/require-role";
import { wrapTool } from "@/lib/mcp/errors";
import { getNextNumber } from "@/lib/api/numbering";
import { findMatches, type MatchCandidate } from "@/lib/banking/reconciliation-matcher";
import { suggestAccounts } from "@/lib/banking/account-suggestions";
import {
  createCategorizationJournalEntry,
  createPaymentJournalEntry,
  getNextEntryNumber,
  resolveBaseRate,
  toBaseLines,
  ensureControlAccount,
  splitGrossTax,
  assertBaseRateAvailable,
} from "@/lib/api/journal-automation";
import { ensureBankLedgerAccount } from "@/lib/api/bank-ledger";
import type { AuthContext } from "@/lib/api/auth-context";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * Load a bank transaction and its owning bank account, org-scoped via the
 * bank account's organizationId. Throws "Bank transaction not found" if either
 * the transaction is missing or its bank account doesn't belong to this org.
 */
async function loadTransactionAndAccount(transactionId: string, ctx: AuthContext) {
  const transaction = await db.query.bankTransaction.findFirst({
    where: eq(bankTransaction.id, transactionId),
  });
  if (!transaction) throw new Error("Bank transaction not found");

  const account = await db.query.bankAccount.findFirst({
    where: and(
      eq(bankAccount.id, transaction.bankAccountId),
      eq(bankAccount.organizationId, ctx.organizationId),
      notDeleted(bankAccount.deletedAt)
    ),
  });
  if (!account) throw new Error("Bank transaction not found");

  return { transaction, account };
}

/** Load an org-scoped bank account or throw. */
async function loadBankAccount(bankAccountId: string, ctx: AuthContext) {
  const account = await db.query.bankAccount.findFirst({
    where: and(
      eq(bankAccount.id, bankAccountId),
      eq(bankAccount.organizationId, ctx.organizationId),
      notDeleted(bankAccount.deletedAt)
    ),
  });
  if (!account) throw new Error("Bank account not found");
  return account;
}

function normalize(s: string | null | undefined): string {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Confidence scoring for "find existing record" candidates (existing payments,
// posted journals, transfer legs) — mirrors the /match route's scoreExisting.
interface ExistingCandidate {
  type: "existing_payment" | "existing_journal" | "transfer";
  id: string;
  journalEntryId: string | null;
  date: string;
  description: string;
  amount: number;
  reference?: string | null;
  meta?: Record<string, unknown>;
}

function scoreExisting(
  tx: { date: string; description: string; amount: number; reference?: string | null; payee?: string | null },
  cand: ExistingCandidate
): { confidence: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  const txAbs = Math.abs(tx.amount);
  const candAbs = Math.abs(cand.amount);
  if (txAbs === candAbs) {
    score += 45;
    reasons.push("Exact amount match");
  } else {
    const diff = Math.abs(txAbs - candAbs);
    const maxAmt = Math.max(txAbs, candAbs);
    if (maxAmt > 0 && diff / maxAmt < 0.01) {
      score += 25;
      reasons.push("Amount within 1%");
    } else if (maxAmt > 0 && diff / maxAmt < 0.05) {
      score += 10;
      reasons.push("Amount within 5%");
    }
  }

  const daysDiff = Math.abs(
    (new Date(tx.date).getTime() - new Date(cand.date).getTime()) / (1000 * 60 * 60 * 24)
  );
  if (daysDiff === 0) {
    score += 25;
    reasons.push("Same date");
  } else if (daysDiff <= 1) {
    score += 20;
    reasons.push("Within 1 day");
  } else if (daysDiff <= 3) {
    score += 15;
    reasons.push("Within 3 days");
  } else if (daysDiff <= 7) {
    score += 8;
    reasons.push("Within 7 days");
  }

  const txRef = normalize(tx.reference);
  const candRef = normalize(cand.reference);
  if (txRef && candRef) {
    if (txRef === candRef) {
      score += 25;
      reasons.push("Exact reference match");
    } else if (txRef.includes(candRef) || candRef.includes(txRef)) {
      score += 15;
      reasons.push("Partial reference match");
    }
  }

  const txText = normalize(`${tx.payee || ""} ${tx.description}`);
  const candText = normalize(cand.description);
  if (txText && candText) {
    if (txText === candText) {
      score += 15;
      reasons.push("Exact description match");
    } else {
      const txWords = new Set(txText.split(/\s+/).filter((w) => w.length > 2));
      const candWords = new Set(candText.split(/\s+/).filter((w) => w.length > 2));
      let overlap = 0;
      for (const w of txWords) if (candWords.has(w)) overlap++;
      const total = Math.max(txWords.size, candWords.size);
      if (total > 0) {
        const ratio = overlap / total;
        if (ratio >= 0.5) {
          score += 10;
          reasons.push("Strong description overlap");
        } else if (ratio >= 0.25) {
          score += 5;
          reasons.push("Some description overlap");
        }
      }
    }
  }

  return { confidence: Math.min(100, score), reasons };
}

export function registerBankTransactionTools(server: McpServer, ctx: AuthContext) {
  server.tool(
    "list_bank_transactions",
    "List bank transactions for a bank account, optionally filtered by status. Use to find lines that still need to be categorized/matched ('for review'). Amounts are in integer cents (negative = money out, positive = money in).",
    {
      bankAccountId: z.string().describe("UUID of the bank account to list transactions for"),
      status: z
        .enum(["unreconciled", "reconciled", "excluded"])
        .optional()
        .describe("Filter by status. 'unreconciled' = still needs review/categorizing."),
      limit: z.number().int().min(1).max(200).optional().default(50).describe("Max rows to return (max 200)"),
      page: z.number().int().min(1).optional().default(1).describe("Page number"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const account = await db.query.bankAccount.findFirst({
          where: and(
            eq(bankAccount.id, params.bankAccountId),
            eq(bankAccount.organizationId, ctx.organizationId),
            notDeleted(bankAccount.deletedAt)
          ),
        });
        if (!account) throw new Error("Bank account not found");

        const conditions = [eq(bankTransaction.bankAccountId, params.bankAccountId)];
        if (params.status) conditions.push(eq(bankTransaction.status, params.status));

        const offset = (params.page - 1) * params.limit;
        const rows = await db.query.bankTransaction.findMany({
          where: and(...conditions),
          orderBy: desc(bankTransaction.date),
          limit: params.limit,
          offset,
          with: { account: true },
        });

        const [countResult] = await db
          .select({ count: sql<number>`count(*)`.mapWith(Number) })
          .from(bankTransaction)
          .where(and(...conditions));

        return {
          transactions: rows.map((t) => ({
            id: t.id,
            date: t.date,
            description: t.description,
            reference: t.reference,
            amount: t.amount,
            currencyCode: t.currencyCode ?? account.currencyCode,
            status: t.status,
            accountId: t.accountId,
            accountName: t.account?.name ?? null,
            journalEntryId: t.journalEntryId,
            reconciliationId: t.reconciliationId,
          })),
          total: Number(countResult?.count ?? 0),
          page: params.page,
          limit: params.limit,
        };
      })
  );

  server.tool(
    "categorize_bank_transaction",
    "Categorize a bank transaction by posting it to a chart-of-accounts account. This is the generic money-in / money-out coding action: the chosen account determines the meaning (expense, income, loan received → a liability account, owner contribution → an equity account, owner drawings, a tax payment, a refund, etc.) and the double entry follows the sign of the amount (money in: DR bank / CR chosen account; money out: DR chosen account / CR bank). Posts a balanced journal entry and marks the transaction reconciled. Amounts are in integer cents.",
    {
      transactionId: z.string().describe("UUID of the bank transaction to categorize"),
      accountId: z.string().describe("UUID of the chart-of-accounts account to post the other side to"),
      contactId: z.string().optional().describe("Optional UUID of the contact (customer/supplier) involved"),
      taxRateId: z.string().optional().describe("Optional UUID of the tax rate to record on the line"),
      memo: z.string().optional().describe("Optional memo; defaults to the transaction description"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:banking");

        const { transaction, account } = await loadTransactionAndAccount(params.transactionId, ctx);
        if (transaction.status === "reconciled") throw new Error("Transaction already reconciled");
        // Connect the bank account to its ledger account automatically (older
        // accounts self-heal on first use) so categorizing never dead-ends.
        const bankGlAccountId = await ensureBankLedgerAccount(ctx.organizationId, account);

        const target = await db.query.chartAccount.findFirst({
          where: and(
            eq(chartAccount.id, params.accountId),
            eq(chartAccount.organizationId, ctx.organizationId)
          ),
        });
        if (!target) throw new Error("Account not found");

        const currencyCode = transaction.currencyCode || account.currencyCode;
        await assertBaseRateAvailable(ctx.organizationId, currencyCode, transaction.date);

        const { entry } = await db.transaction(async (tx) => {
          const entry = await createCategorizationJournalEntry(
            { organizationId: ctx.organizationId, userId: ctx.userId },
            {
              bankGlAccountId,
              otherAccountId: params.accountId,
              amount: transaction.amount,
              date: transaction.date,
              reference: transaction.reference || transaction.description,
              description: params.memo?.trim() || transaction.description,
              currencyCode,
              taxRateId: params.taxRateId || null,
            },
            tx
          );

          await tx
            .update(bankTransaction)
            .set({
              status: "reconciled",
              accountId: params.accountId,
              contactId: params.contactId || null,
              taxRateId: params.taxRateId || null,
              journalEntryId: entry?.id || null,
            })
            .where(eq(bankTransaction.id, params.transactionId));

          return { entry };
        });

        await db.insert(auditLog).values({
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          action: "categorized",
          entityType: "bank_transaction",
          entityId: params.transactionId,
          changes: { accountId: params.accountId, journalEntryId: entry?.id || null, amount: transaction.amount },
        });

        return { transactionId: params.transactionId, journalEntryId: entry?.id || null };
      })
  );

  // -------------------------------------------------------------------------
  // get_match_suggestions — find anything this line could be reconciled to.
  // -------------------------------------------------------------------------
  server.tool(
    "get_match_suggestions",
    "Find candidate records a bank transaction could be reconciled to, ranked by confidence. Returns: open invoices (for money in) / open bills (for money out) that would record a NEW payment when matched; already-recorded payments on this bank account not yet linked; already-posted journal entries hitting this bank's ledger account not yet linked; and opposite-sign unmatched transactions in the org's OTHER bank accounts (transfer candidates). Also returns chart-account suggestions from historically similar categorizations. Read-only. Amounts in integer cents (negative = money out, positive = money in).",
    {
      transactionId: z.string().describe("UUID of the bank transaction to find matches for"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:banking");

        const { transaction, account } = await loadTransactionAndAccount(params.transactionId, ctx);
        const isOutgoing = transaction.amount < 0;
        const txForMatch = {
          id: transaction.id,
          date: transaction.date,
          description: transaction.description,
          amount: transaction.amount,
          reference: transaction.reference,
        };

        // --- Open documents (records a payment when chosen) ---
        let suggestedMatches;
        let openInvoices: Array<Record<string, unknown>> = [];
        let openBills: Array<Record<string, unknown>> = [];

        if (isOutgoing) {
          const bills = await db.query.bill.findMany({
            where: and(
              eq(bill.organizationId, ctx.organizationId),
              notDeleted(bill.deletedAt),
              inArray(bill.status, ["received", "partial", "overdue"])
            ),
            with: { contact: true },
            limit: 50,
          });
          const billCandidates: MatchCandidate[] = bills.map((b) => ({
            type: "bill" as const,
            id: b.id,
            date: b.dueDate,
            description: `${b.billNumber} - ${b.contact?.name || "Unknown"}`,
            amount: -b.amountDue,
            reference: b.reference || b.billNumber,
          }));
          suggestedMatches = findMatches(txForMatch, [], billCandidates, []);
          openBills = bills.map((b) => ({
            id: b.id,
            billNumber: b.billNumber,
            contactName: b.contact?.name || "Unknown",
            dueDate: b.dueDate,
            total: b.total,
            amountDue: b.amountDue,
            status: b.status,
          }));
        } else {
          const invoices = await db.query.invoice.findMany({
            where: and(
              eq(invoice.organizationId, ctx.organizationId),
              notDeleted(invoice.deletedAt),
              inArray(invoice.status, ["sent", "partial", "overdue"])
            ),
            with: { contact: true },
            limit: 50,
          });
          const invoiceCandidates: MatchCandidate[] = invoices.map((inv) => ({
            type: "invoice" as const,
            id: inv.id,
            date: inv.dueDate,
            description: `${inv.invoiceNumber} - ${inv.contact?.name || "Unknown"}`,
            amount: inv.amountDue,
            reference: inv.reference || inv.invoiceNumber,
          }));
          suggestedMatches = findMatches(txForMatch, invoiceCandidates, [], []);
          openInvoices = invoices.map((inv) => ({
            id: inv.id,
            invoiceNumber: inv.invoiceNumber,
            contactName: inv.contact?.name || "Unknown",
            dueDate: inv.dueDate,
            total: inv.total,
            amountDue: inv.amountDue,
            status: inv.status,
          }));
        }

        // Date window for "find existing record" candidates.
        const txDate = new Date(transaction.date);
        const windowDays = 7;
        const windowStart = new Date(txDate);
        windowStart.setDate(windowStart.getDate() - windowDays);
        const windowEnd = new Date(txDate);
        windowEnd.setDate(windowEnd.getDate() + windowDays);
        const startStr = windowStart.toISOString().slice(0, 10);
        const endStr = windowEnd.toISOString().slice(0, 10);

        const existingCandidates: ExistingCandidate[] = [];

        // (a) Existing payments on this bank not yet linked to a bank tx.
        const paymentRows = await db.query.payment.findMany({
          where: and(
            eq(payment.organizationId, ctx.organizationId),
            eq(payment.bankAccountId, account.id),
            isNull(payment.bankTransactionId),
            isNull(payment.deletedAt),
            eq(payment.type, isOutgoing ? "made" : "received"),
            gte(payment.date, startStr),
            lte(payment.date, endStr)
          ),
          with: { contact: true },
          limit: 50,
        });
        for (const p of paymentRows) {
          existingCandidates.push({
            type: "existing_payment",
            id: p.id,
            journalEntryId: p.journalEntryId,
            date: p.date,
            description: `${p.paymentNumber} - ${p.contact?.name || "Unknown"}`,
            amount: isOutgoing ? -p.amount : p.amount,
            reference: p.reference || p.paymentNumber,
            meta: {
              paymentNumber: p.paymentNumber,
              contactName: p.contact?.name || "Unknown",
              method: p.method,
              amount: p.amount,
            },
          });
        }

        // (b) Posted journal lines hitting this bank's GL not yet linked.
        if (account.chartAccountId) {
          const sideColumn = isOutgoing ? journalLine.creditAmount : journalLine.debitAmount;
          const linkedJournalIds = db
            .select({ jid: bankTransaction.journalEntryId })
            .from(bankTransaction)
            .where(sql`${bankTransaction.journalEntryId} is not null`);

          const lineRows = await db
            .select({
              entryId: journalEntry.id,
              entryDate: journalEntry.date,
              entryDescription: journalEntry.description,
              entryReference: journalEntry.reference,
              sourceType: journalEntry.sourceType,
              debit: journalLine.debitAmount,
              credit: journalLine.creditAmount,
            })
            .from(journalLine)
            .innerJoin(journalEntry, eq(journalLine.journalEntryId, journalEntry.id))
            .where(
              and(
                eq(journalEntry.organizationId, ctx.organizationId),
                eq(journalEntry.status, "posted"),
                isNull(journalEntry.deletedAt),
                eq(journalLine.accountId, account.chartAccountId),
                sql`${sideColumn} > 0`,
                gte(journalEntry.date, startStr),
                lte(journalEntry.date, endStr),
                sql`${journalEntry.id} not in ${linkedJournalIds}`
              )
            )
            .limit(50);

          for (const r of lineRows) {
            const lineAmount = isOutgoing ? r.credit : r.debit;
            existingCandidates.push({
              type: "existing_journal",
              id: r.entryId,
              journalEntryId: r.entryId,
              date: r.entryDate,
              description: r.entryDescription,
              amount: isOutgoing ? -lineAmount : lineAmount,
              reference: r.entryReference,
              meta: { sourceType: r.sourceType, amount: lineAmount },
            });
          }
        }

        // (c) Opposite-sign bank transactions in OTHER accounts (transfers).
        const transferRows = await db
          .select({
            id: bankTransaction.id,
            date: bankTransaction.date,
            description: bankTransaction.description,
            reference: bankTransaction.reference,
            amount: bankTransaction.amount,
            bankAccountId: bankTransaction.bankAccountId,
            accountName: bankAccount.accountName,
          })
          .from(bankTransaction)
          .innerJoin(bankAccount, eq(bankTransaction.bankAccountId, bankAccount.id))
          .where(
            and(
              eq(bankAccount.organizationId, ctx.organizationId),
              notDeleted(bankAccount.deletedAt),
              ne(bankTransaction.bankAccountId, account.id),
              // Only surface matchable lines: unreconciled and un-paired.
              // (Reconciled/excluded lines would be rejected at match time.)
              eq(bankTransaction.status, "unreconciled"),
              isNull(bankTransaction.transferTransactionId),
              isOutgoing
                ? sql`${bankTransaction.amount} > 0`
                : sql`${bankTransaction.amount} < 0`,
              gte(bankTransaction.date, startStr),
              lte(bankTransaction.date, endStr)
            )
          )
          .limit(50);

        for (const t of transferRows) {
          existingCandidates.push({
            type: "transfer",
            id: t.id,
            journalEntryId: null,
            date: t.date,
            description: `${t.accountName}: ${t.description}`,
            amount: isOutgoing ? -Math.abs(t.amount) : Math.abs(t.amount),
            reference: t.reference,
            meta: { bankAccountId: t.bankAccountId, accountName: t.accountName, amount: t.amount },
          });
        }

        const existingMatches = existingCandidates
          .map((cand) => {
            const { confidence, reasons } = scoreExisting(
              {
                date: transaction.date,
                description: transaction.description,
                amount: transaction.amount,
                reference: transaction.reference,
                payee: transaction.payee,
              },
              cand
            );
            return { transactionId: transaction.id, candidate: cand, confidence, reasons };
          })
          .filter((m) => m.confidence >= 30)
          .sort((a, b) => b.confidence - a.confidence)
          .slice(0, 10);

        // Chart-account suggestions from historically similar categorizations.
        const accountSuggestions = await suggestAccounts(
          transaction.bankAccountId,
          transaction.description
        );

        return {
          transaction: txForMatch,
          suggestedMatches,
          existingMatches,
          openInvoices,
          openBills,
          accountSuggestions,
        };
      })
  );

  // -------------------------------------------------------------------------
  // match_to_invoice — record a received payment against an open invoice.
  // -------------------------------------------------------------------------
  server.tool(
    "match_to_invoice",
    "Match an INCOMING (money-in) bank transaction to an open invoice. Records a NEW received payment + allocation, posts the settlement journal entry (DR bank / CR accounts receivable), updates the invoice's amount paid/due and status, and marks the bank transaction reconciled. Amounts are in integer cents.",
    {
      transactionId: z.string().describe("UUID of the incoming bank transaction"),
      invoiceId: z.string().describe("UUID of the open invoice to settle"),
      amount: z
        .number()
        .int()
        .positive()
        .describe("Amount to apply to the invoice in integer cents (e.g. $12.50 = 1250)"),
      date: z
        .string()
        .optional()
        .describe("Payment date (YYYY-MM-DD). Defaults to the bank transaction's date."),
      method: z
        .enum(["bank_transfer", "cash", "check", "card", "other"])
        .optional()
        .default("bank_transfer")
        .describe("Payment method recorded on the payment"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:banking");

        const { transaction, account } = await loadTransactionAndAccount(params.transactionId, ctx);
        if (transaction.status === "reconciled") throw new Error("Transaction already reconciled");

        const found = await db.query.invoice.findFirst({
          where: and(
            eq(invoice.id, params.invoiceId),
            eq(invoice.organizationId, ctx.organizationId),
            notDeleted(invoice.deletedAt)
          ),
        });
        if (!found) throw new Error("Invoice not found");
        if (found.status === "draft" || found.status === "void") {
          throw new Error("Cannot record payment for this invoice status");
        }

        const paymentDate = params.date || transaction.date;
        const paymentNumber = await getNextNumber(ctx.organizationId, "payment", "payment_number", "PAY");

        const newAmountPaid = found.amountPaid + params.amount;
        const newAmountDue = found.total - newAmountPaid;
        const newStatus = newAmountDue <= 0 ? "paid" : "partial";

        const { created } = await db.transaction(async (tx) => {
          const [created] = await tx
            .insert(payment)
            .values({
              organizationId: ctx.organizationId,
              contactId: found.contactId,
              paymentNumber,
              type: "received",
              date: paymentDate,
              amount: params.amount,
              currencyCode: found.currencyCode,
              method: params.method,
              bankAccountId: account.id,
              bankTransactionId: params.transactionId,
              createdBy: ctx.userId,
            })
            .returning();

          await tx.insert(paymentAllocation).values({
            paymentId: created.id,
            documentType: "invoice",
            documentId: params.invoiceId,
            amount: params.amount,
          });

          const je = await createPaymentJournalEntry(
            { organizationId: ctx.organizationId, userId: ctx.userId },
            {
              type: "invoice",
              reference: paymentNumber,
              amount: params.amount,
              date: paymentDate,
              allocations: [
                { amount: params.amount, currencyCode: found.currencyCode, issueDate: found.issueDate },
              ],
            },
            tx
          );
          if (je) {
            await tx.update(payment).set({ journalEntryId: je.id }).where(eq(payment.id, created.id));
          }

          await tx
            .update(invoice)
            .set({
              amountPaid: newAmountPaid,
              amountDue: Math.max(0, newAmountDue),
              status: newStatus,
              paidAt: newStatus === "paid" ? new Date() : null,
              updatedAt: new Date(),
            })
            .where(eq(invoice.id, params.invoiceId));

          await tx
            .update(bankTransaction)
            .set({ status: "reconciled", journalEntryId: je?.id || null })
            .where(eq(bankTransaction.id, params.transactionId));

          return { created };
        });

        await db.insert(auditLog).values({
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          action: "matched_invoice",
          entityType: "bank_transaction",
          entityId: params.transactionId,
          changes: { invoiceId: params.invoiceId, paymentId: created.id, amount: params.amount },
        });

        return {
          transactionId: params.transactionId,
          payment: { id: created.id, paymentNumber },
          invoiceStatus: newStatus,
        };
      })
  );

  // -------------------------------------------------------------------------
  // match_to_bill — record a made payment against an open bill.
  // -------------------------------------------------------------------------
  server.tool(
    "match_to_bill",
    "Match an OUTGOING (money-out) bank transaction to an open bill. Records a NEW made payment + allocation, posts the settlement journal entry (DR accounts payable / CR bank), updates the bill's amount paid/due and status, and marks the bank transaction reconciled. Amounts are in integer cents.",
    {
      transactionId: z.string().describe("UUID of the outgoing bank transaction"),
      billId: z.string().describe("UUID of the open bill to settle"),
      amount: z
        .number()
        .int()
        .positive()
        .describe("Amount to apply to the bill in integer cents (e.g. $12.50 = 1250)"),
      date: z
        .string()
        .optional()
        .describe("Payment date (YYYY-MM-DD). Defaults to the bank transaction's date."),
      method: z
        .enum(["bank_transfer", "cash", "check", "card", "other"])
        .optional()
        .default("bank_transfer")
        .describe("Payment method recorded on the payment"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:banking");

        const { transaction, account } = await loadTransactionAndAccount(params.transactionId, ctx);
        if (transaction.status === "reconciled") throw new Error("Transaction already reconciled");

        const found = await db.query.bill.findFirst({
          where: and(
            eq(bill.id, params.billId),
            eq(bill.organizationId, ctx.organizationId),
            notDeleted(bill.deletedAt)
          ),
        });
        if (!found) throw new Error("Bill not found");
        if (found.status === "draft" || found.status === "void") {
          throw new Error("Cannot record payment for this bill status");
        }

        const paymentDate = params.date || transaction.date;
        const paymentNumber = await getNextNumber(ctx.organizationId, "payment", "payment_number", "PAY");

        const newAmountPaid = found.amountPaid + params.amount;
        const newAmountDue = found.total - newAmountPaid;
        const newStatus = newAmountDue <= 0 ? "paid" : "partial";

        const { created } = await db.transaction(async (tx) => {
          const [created] = await tx
            .insert(payment)
            .values({
              organizationId: ctx.organizationId,
              contactId: found.contactId,
              paymentNumber,
              type: "made",
              date: paymentDate,
              amount: params.amount,
              currencyCode: found.currencyCode,
              method: params.method,
              bankAccountId: account.id,
              bankTransactionId: params.transactionId,
              createdBy: ctx.userId,
            })
            .returning();

          await tx.insert(paymentAllocation).values({
            paymentId: created.id,
            documentType: "bill",
            documentId: params.billId,
            amount: params.amount,
          });

          const je = await createPaymentJournalEntry(
            { organizationId: ctx.organizationId, userId: ctx.userId },
            {
              type: "bill",
              reference: paymentNumber,
              amount: params.amount,
              date: paymentDate,
              allocations: [
                { amount: params.amount, currencyCode: found.currencyCode, issueDate: found.issueDate },
              ],
            },
            tx
          );
          if (je) {
            await tx.update(payment).set({ journalEntryId: je.id }).where(eq(payment.id, created.id));
          }

          await tx
            .update(bill)
            .set({
              amountPaid: newAmountPaid,
              amountDue: Math.max(0, newAmountDue),
              status: newStatus,
              paidAt: newStatus === "paid" ? new Date() : null,
              updatedAt: new Date(),
            })
            .where(eq(bill.id, params.billId));

          await tx
            .update(bankTransaction)
            .set({ status: "reconciled", journalEntryId: je?.id || null })
            .where(eq(bankTransaction.id, params.transactionId));

          return { created };
        });

        await db.insert(auditLog).values({
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          action: "matched_bill",
          entityType: "bank_transaction",
          entityId: params.transactionId,
          changes: { billId: params.billId, paymentId: created.id, amount: params.amount },
        });

        return {
          transactionId: params.transactionId,
          payment: { id: created.id, paymentNumber },
          billStatus: newStatus,
        };
      })
  );

  // -------------------------------------------------------------------------
  // match_to_existing_payment — link an already-recorded payment (no new JE).
  // -------------------------------------------------------------------------
  server.tool(
    "match_to_existing_payment",
    "Link a bank transaction to a payment that has ALREADY been recorded (it already carries its own journal entry). No new payment or journal entry is posted: the payment is attached to this bank line, the transaction copies the payment's journalEntryId, and the transaction is marked reconciled. Use this when get_match_suggestions returns an existing_payment candidate.",
    {
      transactionId: z.string().describe("UUID of the bank transaction to reconcile"),
      paymentId: z.string().describe("UUID of the already-recorded payment to link"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:banking");

        const { transaction, account } = await loadTransactionAndAccount(params.transactionId, ctx);
        if (transaction.status === "reconciled") throw new Error("Transaction already reconciled");

        const found = await db.query.payment.findFirst({
          where: and(
            eq(payment.id, params.paymentId),
            eq(payment.organizationId, ctx.organizationId),
            isNull(payment.deletedAt)
          ),
        });
        if (!found) throw new Error("Payment not found");
        if (found.bankTransactionId && found.bankTransactionId !== params.transactionId) {
          throw new Error("Payment is already linked to another bank transaction");
        }

        await db.transaction(async (tx) => {
          await tx
            .update(payment)
            .set({ bankTransactionId: params.transactionId, bankAccountId: account.id, updatedAt: new Date() })
            .where(eq(payment.id, found.id));

          await tx
            .update(bankTransaction)
            .set({
              status: "reconciled",
              journalEntryId: found.journalEntryId || null,
              contactId: found.contactId || transaction.contactId || null,
            })
            .where(eq(bankTransaction.id, params.transactionId));
        });

        await db.insert(auditLog).values({
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          action: "matched_existing_payment",
          entityType: "bank_transaction",
          entityId: params.transactionId,
          changes: { paymentId: found.id, journalEntryId: found.journalEntryId || null },
        });

        return {
          transactionId: params.transactionId,
          paymentId: found.id,
          journalEntryId: found.journalEntryId || null,
        };
      })
  );

  // -------------------------------------------------------------------------
  // match_transfer — reconcile a line as a transfer between own bank accounts.
  // -------------------------------------------------------------------------
  server.tool(
    "match_transfer",
    "Reconcile a bank transaction as a TRANSFER between two of the org's OWN bank accounts (a balance-sheet reclassification with no P&L impact). Posts ONE journal entry that debits the receiving bank's ledger account and credits the sending bank's ledger account (direction follows the sign of this line), marks BOTH legs reconciled, links them via transferTransactionId and a shared transferGroupId, and stamps the journalEntryId on both. Both bank accounts must be linked to a ledger account. Amounts in integer cents.",
    {
      transactionId: z.string().describe("UUID of the source bank transaction (the statement line being matched)"),
      targetBankAccountId: z
        .string()
        .describe("UUID of the OTHER own bank account this transfer moves money to/from (must differ from the source)"),
      counterTransactionId: z
        .string()
        .optional()
        .describe(
          "Optional UUID of the matched statement line in the target bank account. Must be the opposite sign and equal magnitude. Omit to auto-create a mirror reconciled transaction in the target account."
        ),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:banking");

        const { transaction, account: sourceAccount } = await loadTransactionAndAccount(
          params.transactionId,
          ctx
        );
        if (transaction.status === "reconciled") throw new Error("Transaction already reconciled");

        if (params.targetBankAccountId === sourceAccount.id) {
          throw new Error("A transfer must be between two different bank accounts.");
        }

        const targetAccount = await loadBankAccount(params.targetBankAccountId, ctx);

        // Both banks must post to a ledger account; connect them automatically
        // (older accounts self-heal on first use) so transfers never dead-end.
        const sourceGlAccountId = await ensureBankLedgerAccount(ctx.organizationId, sourceAccount);
        const targetGlAccountId = await ensureBankLedgerAccount(ctx.organizationId, targetAccount);

        const abs = Math.abs(transaction.amount);
        if (abs === 0) throw new Error("Cannot transfer a zero-amount transaction.");

        // Resolve the optional counter line.
        let counter: typeof bankTransaction.$inferSelect | null = null;
        if (params.counterTransactionId) {
          const candidate = await db.query.bankTransaction.findFirst({
            where: eq(bankTransaction.id, params.counterTransactionId),
          });
          if (!candidate) throw new Error("Counter transaction not found");
          if (candidate.bankAccountId !== targetAccount.id) {
            throw new Error("The counter transaction must belong to the target bank account.");
          }
          if (candidate.id === transaction.id) {
            throw new Error("A transfer must be between two different transactions.");
          }
          if (candidate.status === "reconciled") {
            throw new Error("Counter transaction already reconciled");
          }
          if (
            Math.sign(candidate.amount) === Math.sign(transaction.amount) ||
            Math.abs(candidate.amount) !== abs
          ) {
            throw new Error(
              "The counter transaction must be the opposite sign and equal amount to this transaction."
            );
          }
          counter = candidate;
        }

        const moneyInToSource = transaction.amount > 0;
        const debitBankAccountId = moneyInToSource
          ? sourceGlAccountId
          : targetGlAccountId;
        const creditBankAccountId = moneyInToSource
          ? targetGlAccountId
          : sourceGlAccountId;

        const currencyCode = transaction.currencyCode || sourceAccount.currencyCode;
        await assertBaseRateAvailable(ctx.organizationId, currencyCode, transaction.date);

        const reference = transaction.reference || transaction.description;
        const description = `Transfer ${sourceAccount.accountName} → ${targetAccount.accountName}`;

        const { entry, mirrorId } = await db.transaction(async (tx) => {
          const entryNumber = await getNextEntryNumber(ctx.organizationId, tx);

          const [entry] = await tx
            .insert(journalEntry)
            .values({
              organizationId: ctx.organizationId,
              entryNumber,
              date: transaction.date,
              description,
              reference,
              status: "posted",
              sourceType: "bank_transfer",
              postedAt: new Date(),
              createdBy: ctx.userId,
            })
            .returning();

          const { currency, rate } = await resolveBaseRate(
            ctx.organizationId,
            currencyCode,
            transaction.date
          );

          const lines: (typeof journalLine.$inferInsert)[] = [
            {
              journalEntryId: entry.id,
              accountId: debitBankAccountId!,
              description,
              debitAmount: abs,
              creditAmount: 0,
            },
            {
              journalEntryId: entry.id,
              accountId: creditBankAccountId!,
              description,
              debitAmount: 0,
              creditAmount: abs,
            },
          ];
          await tx.insert(journalLine).values(toBaseLines(lines, currency, rate));

          const transferGroupId = randomUUID();

          let counterId: string;
          if (counter) {
            counterId = counter.id;
          } else {
            const [mirror] = await tx
              .insert(bankTransaction)
              .values({
                bankAccountId: targetAccount.id,
                date: transaction.date,
                description,
                reference,
                amount: -transaction.amount,
                currencyCode,
                status: "reconciled",
                sourceType: "transfer",
                journalEntryId: entry.id,
                transferTransactionId: transaction.id,
                transferGroupId,
              })
              .returning();
            counterId = mirror.id;
          }

          await tx
            .update(bankTransaction)
            .set({
              status: "reconciled",
              journalEntryId: entry.id,
              transferTransactionId: counterId,
              transferGroupId,
            })
            .where(eq(bankTransaction.id, transaction.id));

          if (counter) {
            await tx
              .update(bankTransaction)
              .set({
                status: "reconciled",
                journalEntryId: entry.id,
                transferTransactionId: transaction.id,
                transferGroupId,
              })
              .where(eq(bankTransaction.id, counter.id));
          }

          return { entry, mirrorId: counter ? null : counterId };
        });

        await db.insert(auditLog).values({
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          action: "matched_transfer",
          entityType: "bank_transaction",
          entityId: params.transactionId,
          changes: {
            targetBankAccountId: targetAccount.id,
            counterTransactionId: counter?.id ?? mirrorId,
            journalEntryId: entry?.id ?? null,
            amount: transaction.amount,
            mirrorCreated: !counter,
          },
        });

        return {
          transactionId: params.transactionId,
          journalEntryId: entry?.id ?? null,
          counterTransactionId: counter?.id ?? mirrorId,
          mirrorCreated: !counter,
        };
      })
  );

  // -------------------------------------------------------------------------
  // split_bank_transaction — code one line across multiple ledger accounts.
  // -------------------------------------------------------------------------
  server.tool(
    "split_bank_transaction",
    "Split ONE bank transaction across MULTIPLE chart-of-accounts accounts in a single balanced posting ('split into categories'). Each allocation codes a slice of the bank amount to a chosen account, optionally tax-aware, with its own cost-center / project dimension. The allocation amounts must sum EXACTLY to the absolute value of the transaction amount. Money in: DR bank (full) / CR each coded account (+ output VAT/sales-tax). Money out: DR each coded account (+ recoverable input VAT) / CR bank (full). Posts one journal entry and marks the transaction reconciled. All amounts in integer cents. (This codes to ledger accounts — to split a payment across invoices/bills use split_to_documents.)",
    {
      transactionId: z.string().describe("UUID of the bank transaction to split"),
      allocations: z
        .array(
          z.object({
            accountId: z.string().describe("UUID of the chart-of-accounts account to code this slice to"),
            amount: z
              .number()
              .int()
              .positive()
              .describe("Magnitude of this slice in integer cents (tax-inclusive)"),
            taxRateId: z
              .string()
              .optional()
              .describe("Optional UUID of the tax rate to split net + tax out of this slice"),
            memo: z.string().optional().describe("Optional per-line memo; defaults to the transaction description"),
            costCenterId: z.string().optional().describe("Optional UUID of a cost-center dimension for this slice"),
            projectId: z.string().optional().describe("Optional UUID of a project/job dimension for this slice"),
          })
        )
        .min(1)
        .describe("Allocations that must sum to the absolute transaction amount in cents"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:banking");

        const { transaction, account } = await loadTransactionAndAccount(params.transactionId, ctx);
        if (transaction.status === "reconciled") throw new Error("Transaction already reconciled");
        // Connect the bank account to its ledger account automatically (older
        // accounts self-heal on first use) so splitting never dead-ends.
        const bankGlAccountId = await ensureBankLedgerAccount(ctx.organizationId, account);

        const abs = Math.abs(transaction.amount);
        if (abs === 0) throw new Error("Cannot split a zero-amount transaction.");

        const totalAllocated = params.allocations.reduce((s, a) => s + a.amount, 0);
        if (totalAllocated !== abs) {
          throw new Error(
            `Allocations must sum to the transaction amount (${abs} cents); got ${totalAllocated} cents.`
          );
        }

        // Verify chosen accounts belong to this org.
        const accountIds = [...new Set(params.allocations.map((a) => a.accountId))];
        const targets = await db.query.chartAccount.findMany({
          where: and(
            eq(chartAccount.organizationId, ctx.organizationId),
            inArray(chartAccount.id, accountIds)
          ),
          columns: { id: true },
        });
        if (targets.length !== accountIds.length) throw new Error("Account not found");

        // Verify referenced cost centers belong to this org.
        const costCenterIds = [
          ...new Set(params.allocations.map((a) => a.costCenterId).filter((v): v is string => !!v)),
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
          if (ccs.length !== costCenterIds.length) throw new Error("Cost center not found");
        }

        // Load referenced tax rates (org-scoped).
        const taxRateIds = [
          ...new Set(params.allocations.map((a) => a.taxRateId).filter((v): v is string => !!v)),
        ];
        const taxRows = taxRateIds.length
          ? await db.query.taxRate.findMany({
              where: and(eq(taxRate.organizationId, ctx.organizationId), inArray(taxRate.id, taxRateIds)),
              columns: { id: true, rate: true, kind: true, recoverablePercent: true },
            })
          : [];
        if (taxRows.length !== taxRateIds.length) throw new Error("Tax rate not found");
        const taxById = new Map(taxRows.map((t) => [t.id, t]));

        const currencyCode = transaction.currencyCode || account.currencyCode;
        await assertBaseRateAvailable(ctx.organizationId, currencyCode, transaction.date);

        const moneyIn = transaction.amount > 0;
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

          // Bank leg for the full amount.
          lines.push({
            journalEntryId: entry.id,
            accountId: bankGlAccountId!,
            description: transaction.description,
            debitAmount: moneyIn ? abs : 0,
            creditAmount: moneyIn ? 0 : abs,
          });

          for (const alloc of params.allocations) {
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
              lines.push({
                journalEntryId: entry.id,
                accountId: alloc.accountId,
                description,
                debitAmount: moneyIn ? 0 : gross,
                creditAmount: moneyIn ? gross : 0,
                ...dims,
              });
            } else if (moneyIn) {
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

          await tx.insert(journalLine).values(toBaseLines(lines, currency, rate));

          await tx
            .update(bankTransaction)
            .set({
              status: "reconciled",
              accountId: null,
              taxRateId: null,
              journalEntryId: entry.id,
            })
            .where(eq(bankTransaction.id, params.transactionId));

          return { entry };
        });

        await db.insert(auditLog).values({
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          action: "split_categorized",
          entityType: "bank_transaction",
          entityId: params.transactionId,
          changes: {
            journalEntryId: entry.id,
            amount: transaction.amount,
            allocations: params.allocations.map((a) => ({
              accountId: a.accountId,
              amount: a.amount,
              taxRateId: a.taxRateId || null,
              costCenterId: a.costCenterId || null,
              projectId: a.projectId || null,
            })),
          },
        });

        return { transactionId: params.transactionId, journalEntryId: entry.id };
      })
  );

  // -------------------------------------------------------------------------
  // bulk_cash_code — categorize many transactions to one account at once.
  // -------------------------------------------------------------------------
  server.tool(
    "bulk_cash_code",
    "Bulk-categorize many bank transactions to the SAME chart-of-accounts account in one call (e.g. code a batch of bank-fee or sweep lines). Each transaction is posted individually with createCategorizationJournalEntry (money in: DR bank / CR account; money out: DR account / CR bank), marked reconciled, and audited. All transactions must belong to bank accounts in this org and be unreconciled. Returns per-transaction results; already-reconciled or invalid lines are skipped and reported. Amounts in integer cents.",
    {
      transactionIds: z
        .array(z.string())
        .min(1)
        .describe("UUIDs of the bank transactions to code (all to the same account)"),
      accountId: z.string().describe("UUID of the chart-of-accounts account to post the other side of every line to"),
      taxRateId: z.string().optional().describe("Optional UUID of the tax rate to apply to every line"),
      memo: z.string().optional().describe("Optional memo applied to every line; defaults to each transaction's description"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:banking");

        const target = await db.query.chartAccount.findFirst({
          where: and(
            eq(chartAccount.id, params.accountId),
            eq(chartAccount.organizationId, ctx.organizationId)
          ),
        });
        if (!target) throw new Error("Account not found");

        const results: Array<{
          transactionId: string;
          ok: boolean;
          journalEntryId?: string | null;
          error?: string;
        }> = [];

        for (const transactionId of params.transactionIds) {
          try {
            const { transaction, account } = await loadTransactionAndAccount(transactionId, ctx);
            if (transaction.status === "reconciled") {
              results.push({ transactionId, ok: false, error: "Transaction already reconciled" });
              continue;
            }
            // Connect the bank account to its ledger account automatically (older
            // accounts self-heal on first use) so coding never dead-ends.
            const bankGlAccountId = await ensureBankLedgerAccount(ctx.organizationId, account);

            const currencyCode = transaction.currencyCode || account.currencyCode;
            await assertBaseRateAvailable(ctx.organizationId, currencyCode, transaction.date);

            const { entry } = await db.transaction(async (tx) => {
              const entry = await createCategorizationJournalEntry(
                { organizationId: ctx.organizationId, userId: ctx.userId },
                {
                  bankGlAccountId,
                  otherAccountId: params.accountId,
                  amount: transaction.amount,
                  date: transaction.date,
                  reference: transaction.reference || transaction.description,
                  description: params.memo?.trim() || transaction.description,
                  currencyCode,
                  taxRateId: params.taxRateId || null,
                },
                tx
              );

              await tx
                .update(bankTransaction)
                .set({
                  status: "reconciled",
                  accountId: params.accountId,
                  taxRateId: params.taxRateId || null,
                  journalEntryId: entry?.id || null,
                })
                .where(eq(bankTransaction.id, transactionId));

              return { entry };
            });

            await db.insert(auditLog).values({
              organizationId: ctx.organizationId,
              userId: ctx.userId,
              action: "categorized",
              entityType: "bank_transaction",
              entityId: transactionId,
              changes: {
                accountId: params.accountId,
                journalEntryId: entry?.id || null,
                amount: transaction.amount,
                bulk: true,
              },
            });

            results.push({ transactionId, ok: true, journalEntryId: entry?.id || null });
          } catch (err) {
            results.push({
              transactionId,
              ok: false,
              error: err instanceof Error ? err.message : "Failed to categorize",
            });
          }
        }

        return {
          accountId: params.accountId,
          requested: params.transactionIds.length,
          succeeded: results.filter((r) => r.ok).length,
          failed: results.filter((r) => !r.ok).length,
          results,
        };
      })
  );

  // -------------------------------------------------------------------------
  // reconcile_bank_transaction — mark reconciled (link to a recon/JE).
  // -------------------------------------------------------------------------
  server.tool(
    "reconcile_bank_transaction",
    "Mark a single bank transaction as reconciled, optionally linking it to a reconciliation session and/or an existing journal entry. This does NOT post any new journal entry on its own — use categorize/match/split tools for lines that still need a posting. Use this to tick off a line that is already accounted for. The transaction must currently be unreconciled.",
    {
      transactionId: z.string().describe("UUID of the bank transaction to reconcile"),
      reconciliationId: z
        .string()
        .optional()
        .describe("Optional UUID of the reconciliation session to roll this line into"),
      journalEntryId: z
        .string()
        .optional()
        .describe("Optional UUID of an existing journal entry to link to this line"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:banking");

        const { transaction, account } = await loadTransactionAndAccount(params.transactionId, ctx);
        if (transaction.status === "reconciled") throw new Error("Transaction is already reconciled");

        // Validate that any supplied journalEntry / reconciliation belong to
        // THIS org before stamping them onto the bank line.
        if (params.journalEntryId) {
          const je = await db.query.journalEntry.findFirst({
            where: and(
              eq(journalEntry.id, params.journalEntryId),
              eq(journalEntry.organizationId, ctx.organizationId)
            ),
          });
          if (!je) throw new Error("Journal entry not found");
        }
        if (params.reconciliationId) {
          const rec = await db.query.bankReconciliation.findFirst({
            where: and(
              eq(bankReconciliation.id, params.reconciliationId),
              eq(bankReconciliation.bankAccountId, account.id)
            ),
          });
          if (!rec) throw new Error("Reconciliation not found");
        }

        const [updated] = await db
          .update(bankTransaction)
          .set({
            status: "reconciled",
            reconciliationId: params.reconciliationId || null,
            journalEntryId: params.journalEntryId || null,
          })
          .where(eq(bankTransaction.id, params.transactionId))
          .returning();

        await db.insert(auditLog).values({
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          action: "reconciled",
          entityType: "bank_transaction",
          entityId: params.transactionId,
          changes: {
            previousStatus: transaction.status,
            reconciliationId: params.reconciliationId || null,
          },
        });

        return {
          transactionId: params.transactionId,
          status: updated.status,
          reconciliationId: updated.reconciliationId,
          journalEntryId: updated.journalEntryId,
        };
      })
  );

  // -------------------------------------------------------------------------
  // unreconcile_bank_transaction — undo a reconcile, reversing side-effects.
  // -------------------------------------------------------------------------
  server.tool(
    "unreconcile_bank_transaction",
    "Undo the reconciliation of a bank transaction and roll back its side effects. If a payment was recorded for this line: its allocations are reversed (restoring each invoice/bill amount paid/due and status), the payment and its journal entry are voided/soft-deleted. If the line was categorized or split-to-account: that categorization journal entry is voided so the ledger no longer double-counts. If the line was matched as a transfer: the shared transfer journal entry is voided once and the paired (counter) leg is unwound too — an auto-created mirror line is deleted, a matched statement line is reset to unreconciled — so both legs come undone together. The transaction returns to 'unreconciled' with its reconciliationId, journalEntryId and transfer pairing cleared. The transaction must currently be reconciled.",
    {
      transactionId: z.string().describe("UUID of the reconciled bank transaction to unreconcile"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:banking");

        const { transaction } = await loadTransactionAndAccount(params.transactionId, ctx);
        if (transaction.status !== "reconciled") throw new Error("Transaction is not reconciled");

        const linkedPayment = await db.query.payment.findFirst({
          where: and(
            eq(payment.bankTransactionId, params.transactionId),
            isNull(payment.deletedAt)
          ),
          with: { allocations: true },
        });

        const { result } = await db.transaction(async (tx) => {
          let linkedPaymentId: string | null = null;
          let reversedAllocations = 0;
          let voidedJournalEntryId: string | null = null;
          let unwoundTransferLegId: string | null = null;
          let deletedTransferMirror = false;

          // Transfer-aware unwind: a transfer match posts ONE shared journal
          // entry referenced by BOTH legs and pairs them via
          // transferTransactionId. Unreconciling one leg must unwind the other
          // too (void the shared JE once, reset or delete the counter leg, and
          // clear the pairing fields) so no counter leg is left reconciled
          // pointing at a voided JE.
          if (transaction.transferTransactionId) {
            const counter = await tx.query.bankTransaction.findFirst({
              where: eq(bankTransaction.id, transaction.transferTransactionId),
            });

            if (transaction.journalEntryId) {
              await tx
                .update(journalEntry)
                .set({
                  status: "void",
                  voidedAt: new Date(),
                  voidReason: "Bank transfer unreconciled",
                  deletedAt: new Date(),
                  updatedAt: new Date(),
                })
                .where(
                  and(
                    eq(journalEntry.id, transaction.journalEntryId),
                    eq(journalEntry.organizationId, ctx.organizationId)
                  )
                );
              voidedJournalEntryId = transaction.journalEntryId;
            }

            if (counter) {
              // Auto-created mirror (sourceType 'transfer', no statement
              // origin) is deleted; a matched statement line is reset.
              const isAutoMirror =
                counter.sourceType === "transfer" && counter.importId === null;
              if (isAutoMirror) {
                await tx
                  .delete(bankTransaction)
                  .where(eq(bankTransaction.id, counter.id));
                deletedTransferMirror = true;
              } else {
                await tx
                  .update(bankTransaction)
                  .set({
                    status: "unreconciled",
                    journalEntryId: null,
                    transferTransactionId: null,
                    transferGroupId: null,
                  })
                  .where(eq(bankTransaction.id, counter.id));
              }
              unwoundTransferLegId = counter.id;
            }
          }

          if (linkedPayment) {
            linkedPaymentId = linkedPayment.id;

            for (const allocation of linkedPayment.allocations) {
              if (allocation.documentType === "bill") {
                const existingBill = await tx.query.bill.findFirst({
                  where: eq(bill.id, allocation.documentId),
                });
                if (existingBill) {
                  const newAmountPaid = existingBill.amountPaid - allocation.amount;
                  const newAmountDue = existingBill.amountDue + allocation.amount;
                  const newStatus = newAmountPaid > 0 ? "partial" : "received";
                  await tx
                    .update(bill)
                    .set({
                      amountPaid: newAmountPaid,
                      amountDue: newAmountDue,
                      status: newStatus,
                      paidAt: null,
                      updatedAt: new Date(),
                    })
                    .where(eq(bill.id, allocation.documentId));
                }
              } else if (allocation.documentType === "invoice") {
                const existingInvoice = await tx.query.invoice.findFirst({
                  where: eq(invoice.id, allocation.documentId),
                });
                if (existingInvoice) {
                  const newAmountPaid = existingInvoice.amountPaid - allocation.amount;
                  const newAmountDue = existingInvoice.amountDue + allocation.amount;
                  const newStatus = newAmountPaid > 0 ? "partial" : "sent";
                  await tx
                    .update(invoice)
                    .set({
                      amountPaid: newAmountPaid,
                      amountDue: newAmountDue,
                      status: newStatus,
                      paidAt: null,
                      updatedAt: new Date(),
                    })
                    .where(eq(invoice.id, allocation.documentId));
                }
              }
              reversedAllocations++;
            }

            if (linkedPayment.allocations.length > 0) {
              await tx
                .delete(paymentAllocation)
                .where(eq(paymentAllocation.paymentId, linkedPayment.id));
            }

            if (linkedPayment.journalEntryId) {
              await tx
                .update(journalEntry)
                .set({ status: "void", deletedAt: new Date(), updatedAt: new Date() })
                .where(eq(journalEntry.id, linkedPayment.journalEntryId));
            }

            await tx
              .update(payment)
              .set({ deletedAt: new Date(), updatedAt: new Date() })
              .where(eq(payment.id, linkedPayment.id));
          } else if (transaction.journalEntryId && !transaction.transferTransactionId) {
            // Transfer JEs are already voided above; only void a plain
            // categorization/split JE here.
            await tx
              .update(journalEntry)
              .set({
                status: "void",
                voidedAt: new Date(),
                voidReason: "Bank transaction unreconciled",
                deletedAt: new Date(),
                updatedAt: new Date(),
              })
              .where(
                and(
                  eq(journalEntry.id, transaction.journalEntryId),
                  eq(journalEntry.organizationId, ctx.organizationId)
                )
              );
            voidedJournalEntryId = transaction.journalEntryId;
          }

          const [updated] = await tx
            .update(bankTransaction)
            .set({
              status: "unreconciled",
              reconciliationId: null,
              journalEntryId: null,
              transferTransactionId: null,
              transferGroupId: null,
            })
            .where(eq(bankTransaction.id, params.transactionId))
            .returning();

          await tx.insert(auditLog).values({
            organizationId: ctx.organizationId,
            userId: ctx.userId,
            action: "unreconciled",
            entityType: "bank_transaction",
            entityId: params.transactionId,
            changes: {
              previousStatus: "reconciled",
              paymentId: linkedPaymentId,
              reversedAllocations,
              voidedJournalEntryId,
              unwoundTransferLegId,
              deletedTransferMirror,
            },
          });

          return {
            result: {
              transactionId: params.transactionId,
              status: updated.status,
              paymentId: linkedPaymentId,
              reversedAllocations,
              voidedJournalEntryId,
              unwoundTransferLegId,
              deletedTransferMirror,
            },
          };
        });

        return result;
      })
  );

  // -------------------------------------------------------------------------
  // exclude_bank_transaction — toggle exclude/restore for a line.
  // -------------------------------------------------------------------------
  server.tool(
    "exclude_bank_transaction",
    "Toggle whether a bank transaction is EXCLUDED from reconciliation (e.g. a duplicate import or a personal line that should never hit the books). An unreconciled line becomes 'excluded'; an already-excluded line is restored to 'unreconciled'. A reconciled line cannot be excluded — unreconcile it first. No journal entries are posted. Returns the new status.",
    {
      transactionId: z.string().describe("UUID of the bank transaction to exclude/restore"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:banking");

        const { transaction } = await loadTransactionAndAccount(params.transactionId, ctx);
        if (transaction.status === "reconciled") {
          throw new Error("Cannot exclude a reconciled transaction");
        }

        const newStatus = transaction.status === "excluded" ? "unreconciled" : "excluded";

        const [updated] = await db
          .update(bankTransaction)
          .set({ status: newStatus })
          .where(eq(bankTransaction.id, params.transactionId))
          .returning();

        await db.insert(auditLog).values({
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          action: newStatus === "excluded" ? "exclude" : "restore",
          entityType: "bank_transaction",
          entityId: params.transactionId,
          changes: { previousStatus: transaction.status },
        });

        return { transactionId: params.transactionId, status: updated.status };
      })
  );

  // -------------------------------------------------------------------------
  // reconciliation_report — reconciliation proof for a bank account.
  // -------------------------------------------------------------------------
  server.tool(
    "reconciliation_report",
    "Reconciliation proof for one bank account: returns the reconciled vs unreconciled statement lines for the period, the statement closing balance, the GL/ledger balance of the bank's chart-of-accounts account (sum of posted debits minus credits, bounded to the statement end date), and the difference between them (positive = statement shows more than the books). Scope to a specific reconciliation session via reconciliationId, otherwise the latest session (or the whole account) is used. Read-only. Amounts in integer cents.",
    {
      bankAccountId: z.string().describe("UUID of the bank account to prove"),
      reconciliationId: z
        .string()
        .optional()
        .describe("Optional UUID of a specific reconciliation session to scope to; defaults to the latest"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:banking");

        const account = await loadBankAccount(params.bankAccountId, ctx);

        // Scope to a specific reconciliation if given, else the latest one.
        let rec: typeof bankReconciliation.$inferSelect | undefined;
        if (params.reconciliationId) {
          rec = await db.query.bankReconciliation.findFirst({
            where: and(
              eq(bankReconciliation.id, params.reconciliationId),
              eq(bankReconciliation.bankAccountId, account.id)
            ),
          });
          if (!rec) throw new Error("Reconciliation not found");
        } else {
          rec = await db.query.bankReconciliation.findFirst({
            where: eq(bankReconciliation.bankAccountId, account.id),
            orderBy: desc(bankReconciliation.createdAt),
          });
        }

        const reconciledWhere = rec
          ? eq(bankTransaction.reconciliationId, rec.id)
          : sql`${bankTransaction.reconciliationId} IS NOT NULL`;
        const reconciled = await db.query.bankTransaction.findMany({
          where: and(eq(bankTransaction.bankAccountId, account.id), reconciledWhere),
          orderBy: asc(bankTransaction.date),
        });

        const unreconciledConds = [
          eq(bankTransaction.bankAccountId, account.id),
          isNull(bankTransaction.reconciliationId),
          sql`${bankTransaction.status} <> 'excluded'`,
        ];
        if (rec) {
          unreconciledConds.push(gte(bankTransaction.date, rec.startDate));
          unreconciledConds.push(lte(bankTransaction.date, rec.endDate));
        }
        const unreconciled = await db.query.bankTransaction.findMany({
          where: and(...unreconciledConds),
          orderBy: asc(bankTransaction.date),
        });

        const statementEndBalance = rec ? rec.endBalance : account.balance;

        // GL/ledger balance of the bank's chart account, bounded to the
        // statement end date when known.
        let glBalance: number | null = null;
        if (account.chartAccountId) {
          const conds = [
            eq(journalLine.accountId, account.chartAccountId),
            eq(journalEntry.organizationId, ctx.organizationId),
            eq(journalEntry.status, "posted"),
          ];
          if (rec?.endDate) conds.push(lte(journalEntry.date, rec.endDate));
          const [row] = await db
            .select({
              balance: sql<number>`coalesce(sum(${journalLine.debitAmount} - ${journalLine.creditAmount}), 0)::int`,
            })
            .from(journalLine)
            .innerJoin(journalEntry, eq(journalLine.journalEntryId, journalEntry.id))
            .where(and(...conds));
          glBalance = row?.balance || 0;
        }

        const difference = glBalance === null ? null : statementEndBalance - glBalance;
        const sumAmount = (rows: typeof reconciled) => rows.reduce((s, r) => s + r.amount, 0);

        return {
          bankAccountId: account.id,
          reconciliation: rec ?? null,
          statementEndBalance,
          glBalance,
          difference,
          isBalanced: difference === 0,
          hasLedgerAccount: account.chartAccountId !== null,
          reconciled: {
            count: reconciled.length,
            total: sumAmount(reconciled),
            transactions: reconciled,
          },
          unreconciled: {
            count: unreconciled.length,
            total: sumAmount(unreconciled),
            transactions: unreconciled,
          },
        };
      })
  );
}
