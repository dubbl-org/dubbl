import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  bankTransaction,
  bankAccount,
  bill,
  invoice,
  payment,
  paymentAllocation,
  journalEntry,
  journalLine,
  auditLog,
} from "@/lib/db/schema";
import { eq, and, inArray, isNull, ne, gte, lte, sql } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { findMatches, type MatchCandidate } from "@/lib/banking/reconciliation-matcher";
import { createPaymentJournalEntry } from "@/lib/api/journal-automation";
import { getNextNumber } from "@/lib/api/numbering";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Confidence scoring for "find existing record" candidates (payments, posted
// journals, transfer legs). The reconciliation-matcher only knows about
// invoice/bill/journal_entry candidate types, so we score these extra kinds
// here with the same intuition: exact amount + close date + payee/description
// similarity rank highest.
// ---------------------------------------------------------------------------

interface ExistingCandidate {
  type: "existing_payment" | "existing_journal" | "transfer";
  id: string; // payment.id / journalEntry.id / opposite bankTransaction.id
  journalEntryId: string | null; // the JE to link (already posted)
  date: string;
  description: string;
  amount: number; // signed cents, oriented to compare against the bank tx
  reference?: string | null;
  // Extra display context surfaced to the UI.
  meta?: Record<string, unknown>;
}

function normalize(s: string | null | undefined): string {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreExisting(
  tx: { date: string; description: string; amount: number; reference?: string | null; payee?: string | null },
  cand: ExistingCandidate
): { confidence: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  // Amount (compared on absolute value — sign orientation is handled by query).
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

  // Date proximity.
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

  // Reference match.
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

  // Payee / description similarity.
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

// GET: Find potential matches for a bank transaction.
//
// Returns, in priority order, anything this transaction could be reconciled to:
//   - open invoices (money in) / open bills (money out)        — records a payment
//   - existing payments hitting this bank not yet linked        — links existing JE
//   - posted journal lines hitting this bank's GL not yet linked — links existing JE
//   - opposite-sign bank transactions in OTHER accounts         — transfer candidates
// Each existing/transfer candidate carries the journalEntryId to link so POST
// never re-posts a journal that already exists.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:banking");

    // Find the transaction and verify ownership
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
    let allOpenInvoices: Array<Record<string, unknown>> = [];
    let allOpenBills: Array<Record<string, unknown>> = [];

    if (isOutgoing) {
      const openBills = await db.query.bill.findMany({
        where: and(
          eq(bill.organizationId, ctx.organizationId),
          notDeleted(bill.deletedAt),
          inArray(bill.status, ["received", "partial", "overdue"])
        ),
        with: { contact: true },
        limit: 50,
      });
      const billCandidates: MatchCandidate[] = openBills.map((b) => ({
        type: "bill" as const,
        id: b.id,
        date: b.dueDate,
        description: `${b.billNumber} - ${b.contact?.name || "Unknown"}`,
        amount: -b.amountDue,
        reference: b.reference || b.billNumber,
      }));
      suggestedMatches = findMatches(txForMatch, [], billCandidates, []);
      allOpenBills = openBills.map((b) => ({
        id: b.id,
        billNumber: b.billNumber,
        contactName: b.contact?.name || "Unknown",
        dueDate: b.dueDate,
        total: b.total,
        amountDue: b.amountDue,
        status: b.status,
      }));
    } else {
      const openInvoices = await db.query.invoice.findMany({
        where: and(
          eq(invoice.organizationId, ctx.organizationId),
          notDeleted(invoice.deletedAt),
          inArray(invoice.status, ["sent", "partial", "overdue"])
        ),
        with: { contact: true },
        limit: 50,
      });
      const invoiceCandidates: MatchCandidate[] = openInvoices.map((inv) => ({
        type: "invoice" as const,
        id: inv.id,
        date: inv.dueDate,
        description: `${inv.invoiceNumber} - ${inv.contact?.name || "Unknown"}`,
        amount: inv.amountDue,
        reference: inv.reference || inv.invoiceNumber,
      }));
      suggestedMatches = findMatches(txForMatch, invoiceCandidates, [], []);
      allOpenInvoices = openInvoices.map((inv) => ({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        contactName: inv.contact?.name || "Unknown",
        dueDate: inv.dueDate,
        total: inv.total,
        amountDue: inv.amountDue,
        status: inv.status,
      }));
    }

    // Date/amount window for the "find existing record" candidates.
    const txDate = new Date(transaction.date);
    const windowDays = 7;
    const windowStart = new Date(txDate);
    windowStart.setDate(windowStart.getDate() - windowDays);
    const windowEnd = new Date(txDate);
    windowEnd.setDate(windowEnd.getDate() + windowDays);
    const startStr = windowStart.toISOString().slice(0, 10);
    const endStr = windowEnd.toISOString().slice(0, 10);

    const existingCandidates: ExistingCandidate[] = [];

    // --- (a) Existing payments on this bank not yet linked to a bank tx ---
    // received payments are money in; made payments are money out. Match
    // direction so a money-out tx only sees outgoing payments and vice versa.
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

    // --- (b) Posted journal lines hitting this bank's GL not yet linked ---
    // Only when the bank account has a GL account. Money-in transactions look
    // for entries that DEBITED the bank (debitAmount > 0); money-out for ones
    // that CREDITED it. Exclude journals already linked to any bank tx so we
    // never offer a journal that's already reconciled elsewhere.
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
          meta: {
            sourceType: r.sourceType,
            amount: lineAmount,
          },
        });
      }
    }

    // --- (c) Opposite-sign bank transactions in OTHER accounts (transfers) ---
    // A money-out leg here pairs with a money-in leg elsewhere. We only surface
    // unreconciled, un-paired lines in other bank accounts of this org.
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
          // Only surface lines that can actually be matched: unreconciled and
          // un-paired. (Reconciled/excluded lines would be rejected by POST.)
          eq(bankTransaction.status, "unreconciled"),
          isNull(bankTransaction.transferTransactionId),
          // opposite sign of this transaction
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
        // Orient to compare absolute amounts; sign mirrors this tx's direction.
        amount: isOutgoing ? -Math.abs(t.amount) : Math.abs(t.amount),
        reference: t.reference,
        meta: {
          bankAccountId: t.bankAccountId,
          accountName: t.accountName,
          amount: t.amount,
        },
      });
    }

    // Score & rank the existing/transfer candidates; keep a reasonable cut.
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
        return {
          transactionId: transaction.id,
          candidate: cand,
          confidence,
          reasons,
        };
      })
      .filter((m) => m.confidence >= 30)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 10);

    return NextResponse.json({
      transaction: txForMatch,
      suggestedMatches,
      // Existing records (payments / posted journals) and transfer candidates,
      // ranked by confidence. POST these with the corresponding matchType.
      existingMatches,
      openInvoices: allOpenInvoices,
      openBills: allOpenBills,
    });
  } catch (err) {
    return handleError(err);
  }
}

// POST: Reconcile a bank transaction to an existing or open record.
//
//   matchType "invoice" / "bill" (or legacy: pass invoiceId/billId)
//       Records a NEW payment + allocation + journal entry, updates the
//       document, and marks the transaction reconciled.
//   matchType "existing_payment"
//       Links to an ALREADY-RECORDED payment on this bank (no new JE): sets
//       payment.bankTransactionId, copies the payment's journalEntryId onto the
//       transaction, marks it reconciled.
//   matchType "existing_journal"
//       Links to an ALREADY-POSTED journal entry hitting this bank's GL (no new
//       JE): sets the transaction's journalEntryId, marks it reconciled.
const matchSchema = z
  .object({
    matchType: z
      .enum(["invoice", "bill", "existing_payment", "existing_journal"])
      .optional(),
    billId: z.string().min(1).optional(),
    invoiceId: z.string().min(1).optional(),
    paymentId: z.string().min(1).optional(),
    journalEntryId: z.string().min(1).optional(),
    amount: z.number().int().min(1).optional(), // cents — required for invoice/bill
    date: z.string().min(1).optional(),
    method: z
      .enum(["bank_transfer", "cash", "check", "card", "other"])
      .default("bank_transfer"),
  })
  .refine(
    (d) =>
      d.matchType ||
      d.billId ||
      d.invoiceId ||
      d.paymentId ||
      d.journalEntryId,
    { message: "A matchType or one of billId/invoiceId/paymentId/journalEntryId is required" }
  );

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:banking");

    const body = await request.json();
    const parsed = matchSchema.parse(body);

    // Verify transaction
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

    // Resolve the effective match type (matchType wins; else infer from ids).
    const matchType =
      parsed.matchType ??
      (parsed.invoiceId
        ? "invoice"
        : parsed.billId
          ? "bill"
          : parsed.paymentId
            ? "existing_payment"
            : parsed.journalEntryId
              ? "existing_journal"
              : undefined);

    // ----------------------------------------------------------------------
    // Link to an EXISTING payment — it already carries its own journal entry,
    // so we just attach it to this bank line and reconcile (no new posting).
    // ----------------------------------------------------------------------
    if (matchType === "existing_payment") {
      if (!parsed.paymentId) {
        return NextResponse.json({ error: "paymentId is required" }, { status: 400 });
      }
      const found = await db.query.payment.findFirst({
        where: and(
          eq(payment.id, parsed.paymentId),
          eq(payment.organizationId, ctx.organizationId),
          isNull(payment.deletedAt)
        ),
      });
      if (!found) return notFound("Payment");
      if (found.bankTransactionId && found.bankTransactionId !== id) {
        return NextResponse.json(
          { error: "Payment is already linked to another bank transaction" },
          { status: 400 }
        );
      }

      await db.transaction(async (tx) => {
        await tx
          .update(payment)
          .set({ bankTransactionId: id, bankAccountId: account.id, updatedAt: new Date() })
          .where(eq(payment.id, found.id));

        await tx
          .update(bankTransaction)
          .set({
            status: "reconciled",
            journalEntryId: found.journalEntryId || null,
            contactId: found.contactId || transaction.contactId || null,
          })
          .where(eq(bankTransaction.id, id));
      });

      await db.insert(auditLog).values({
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        action: "matched_existing_payment",
        entityType: "bank_transaction",
        entityId: id,
        changes: { paymentId: found.id, journalEntryId: found.journalEntryId || null },
      });

      return NextResponse.json({
        matchType: "existing_payment",
        paymentId: found.id,
        journalEntryId: found.journalEntryId || null,
      });
    }

    // ----------------------------------------------------------------------
    // Link to an EXISTING posted journal entry — already posted, so just point
    // the bank line at it and reconcile (no new posting).
    // ----------------------------------------------------------------------
    if (matchType === "existing_journal") {
      if (!parsed.journalEntryId) {
        return NextResponse.json({ error: "journalEntryId is required" }, { status: 400 });
      }
      const found = await db.query.journalEntry.findFirst({
        where: and(
          eq(journalEntry.id, parsed.journalEntryId),
          eq(journalEntry.organizationId, ctx.organizationId),
          isNull(journalEntry.deletedAt)
        ),
      });
      if (!found) return notFound("Journal entry");
      if (found.status !== "posted") {
        return NextResponse.json(
          { error: "Only posted journal entries can be matched" },
          { status: 400 }
        );
      }

      // Don't allow linking a journal that's already reconciled to another line.
      const already = await db.query.bankTransaction.findFirst({
        where: and(
          eq(bankTransaction.journalEntryId, found.id),
          ne(bankTransaction.id, id)
        ),
      });
      if (already) {
        return NextResponse.json(
          { error: "Journal entry is already matched to another bank transaction" },
          { status: 400 }
        );
      }

      await db
        .update(bankTransaction)
        .set({ status: "reconciled", journalEntryId: found.id })
        .where(eq(bankTransaction.id, id));

      await db.insert(auditLog).values({
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        action: "matched_existing_journal",
        entityType: "bank_transaction",
        entityId: id,
        changes: { journalEntryId: found.id },
      });

      return NextResponse.json({
        matchType: "existing_journal",
        journalEntryId: found.id,
      });
    }

    // ----------------------------------------------------------------------
    // Record a NEW payment against an open invoice or bill (existing behavior).
    // ----------------------------------------------------------------------
    const isInvoiceMatch = matchType === "invoice";
    const documentId = (isInvoiceMatch ? parsed.invoiceId : parsed.billId)!;
    if (!documentId) {
      return NextResponse.json(
        { error: isInvoiceMatch ? "invoiceId is required" : "billId is required" },
        { status: 400 }
      );
    }
    if (!parsed.amount) {
      return NextResponse.json({ error: "amount is required" }, { status: 400 });
    }
    const paymentDate = parsed.date || transaction.date;
    // The bank line's amount is in the bank account's currency. Recording a
    // payment here books that raw amount in the DOCUMENT's currency, so a
    // currency mismatch (e.g. a USD line against a EUR invoice) would mark the
    // document paid by the wrong figure and post incorrect GL. Require a match.
    const bankCurrency = transaction.currencyCode || account.currencyCode;

    if (isInvoiceMatch) {
      // Match to invoice (incoming payment)
      const found = await db.query.invoice.findFirst({
        where: and(
          eq(invoice.id, documentId),
          eq(invoice.organizationId, ctx.organizationId),
          notDeleted(invoice.deletedAt)
        ),
      });
      if (!found) return notFound("Invoice");
      if (found.status === "draft" || found.status === "void") {
        return NextResponse.json({ error: "Cannot record payment for this invoice status" }, { status: 400 });
      }
      if (found.currencyCode !== bankCurrency) {
        return NextResponse.json(
          { error: `This invoice is in ${found.currencyCode} but the bank account is in ${bankCurrency}. Match it to a document in the same currency.` },
          { status: 400 }
        );
      }

      const paymentNumber = await getNextNumber(ctx.organizationId, "payment", "payment_number", "PAY");

      const newAmountPaid = found.amountPaid + parsed.amount;
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
            amount: parsed.amount!,
            currencyCode: found.currencyCode,
            method: parsed.method,
            bankAccountId: account.id,
            bankTransactionId: id,
            createdBy: ctx.userId,
          })
          .returning();

        await tx.insert(paymentAllocation).values({
          paymentId: created.id,
          documentType: "invoice",
          documentId,
          amount: parsed.amount!,
        });

        const je = await createPaymentJournalEntry(
          { organizationId: ctx.organizationId, userId: ctx.userId },
          {
            type: "invoice",
            reference: paymentNumber,
            amount: parsed.amount!,
            date: paymentDate,
            allocations: [
              {
                amount: parsed.amount!,
                currencyCode: found.currencyCode,
                issueDate: found.issueDate,
              },
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
          .where(eq(invoice.id, documentId));

        await tx
          .update(bankTransaction)
          .set({ status: "reconciled", journalEntryId: je?.id || null })
          .where(eq(bankTransaction.id, id));

        return { created };
      });

      await db.insert(auditLog).values({
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        action: "matched_invoice",
        entityType: "bank_transaction",
        entityId: id,
        changes: { invoiceId: documentId, paymentId: created.id, amount: parsed.amount },
      });

      return NextResponse.json({
        payment: { id: created.id, paymentNumber },
        invoiceStatus: newStatus,
      });
    }

    // Match to bill (outgoing payment)
    const found = await db.query.bill.findFirst({
      where: and(
        eq(bill.id, documentId),
        eq(bill.organizationId, ctx.organizationId),
        notDeleted(bill.deletedAt)
      ),
    });
    if (!found) return notFound("Bill");
    if (found.status === "draft" || found.status === "void") {
      return NextResponse.json({ error: "Cannot record payment for this bill status" }, { status: 400 });
    }
    if (found.currencyCode !== bankCurrency) {
      return NextResponse.json(
        { error: `This bill is in ${found.currencyCode} but the bank account is in ${bankCurrency}. Match it to a document in the same currency.` },
        { status: 400 }
      );
    }

    const paymentNumber = await getNextNumber(ctx.organizationId, "payment", "payment_number", "PAY");

    // Settle against the outstanding balance (amountDue), not total - paid, so
    // reverse-charge bills (payable < total) can still reach "paid".
    const newAmountPaid = found.amountPaid + parsed.amount;
    const newAmountDue = found.amountDue - parsed.amount;
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
          amount: parsed.amount!,
          currencyCode: found.currencyCode,
          method: parsed.method,
          bankAccountId: account.id,
          bankTransactionId: id,
          createdBy: ctx.userId,
        })
        .returning();

      await tx.insert(paymentAllocation).values({
        paymentId: created.id,
        documentType: "bill",
        documentId,
        amount: parsed.amount!,
      });

      const journalEntryRow = await createPaymentJournalEntry(
        { organizationId: ctx.organizationId, userId: ctx.userId },
        {
          type: "bill",
          reference: paymentNumber,
          amount: parsed.amount!,
          date: paymentDate,
          allocations: [
            {
              amount: parsed.amount!,
              currencyCode: found.currencyCode,
              issueDate: found.issueDate,
            },
          ],
        },
        tx
      );
      if (journalEntryRow) {
        await tx.update(payment).set({ journalEntryId: journalEntryRow.id }).where(eq(payment.id, created.id));
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
        .where(eq(bill.id, documentId));

      await tx
        .update(bankTransaction)
        .set({ status: "reconciled", journalEntryId: journalEntryRow?.id || null })
        .where(eq(bankTransaction.id, id));

      return { created };
    });

    await db.insert(auditLog).values({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: "matched_bill",
      entityType: "bank_transaction",
      entityId: id,
      changes: { billId: documentId, paymentId: created.id, amount: parsed.amount },
    });

    return NextResponse.json({
      payment: { id: created.id, paymentNumber },
      billStatus: newStatus,
    });
  } catch (err) {
    return handleError(err);
  }
}
