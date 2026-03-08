import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  contact,
  invoice,
  creditNote,
  bill,
  debitNote,
  payment,
  paymentAllocation,
} from "@/lib/db/schema";
import { eq, and, gte, lte, lt, notInArray, isNull } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError, notFound } from "@/lib/api/response";

interface StatementTransaction {
  date: string;
  type: "invoice" | "credit_note" | "payment" | "bill" | "debit_note";
  documentNumber: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getAuthContext(request);
    const { id } = await params;

    // Verify contact belongs to org
    const contactRow = await db
      .select()
      .from(contact)
      .where(
        and(
          eq(contact.id, id),
          eq(contact.organizationId, ctx.organizationId),
          isNull(contact.deletedAt)
        )
      )
      .limit(1);

    if (!contactRow.length) {
      return notFound("Contact");
    }

    const c = contactRow[0];
    const url = new URL(request.url);
    const now = new Date();
    const defaultStart = `${now.getFullYear() - 1}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const defaultEnd = now.toISOString().slice(0, 10);

    const startDate = url.searchParams.get("startDate") || defaultStart;
    const endDate = url.searchParams.get("endDate") || defaultEnd;

    const isCustomer = c.type === "customer" || c.type === "both";
    const isSupplier = c.type === "supplier" || c.type === "both";

    // ---------- Opening balance ----------
    let openingBalance = 0;

    // Invoices before startDate (customer owes us)
    if (isCustomer) {
      const priorInvoices = await db
        .select({ total: invoice.amountDue })
        .from(invoice)
        .where(
          and(
            eq(invoice.organizationId, ctx.organizationId),
            eq(invoice.contactId, id),
            lt(invoice.issueDate, startDate),
            notInArray(invoice.status, ["draft", "void"]),
            isNull(invoice.deletedAt)
          )
        );
      openingBalance += priorInvoices.reduce((s, r) => s + r.total, 0);

      // Credit notes before startDate reduce the balance
      const priorCredits = await db
        .select({ total: creditNote.total })
        .from(creditNote)
        .where(
          and(
            eq(creditNote.organizationId, ctx.organizationId),
            eq(creditNote.contactId, id),
            lt(creditNote.issueDate, startDate),
            notInArray(creditNote.status, ["draft", "void"]),
            isNull(creditNote.deletedAt)
          )
        );
      openingBalance -= priorCredits.reduce((s, r) => s + r.total, 0);

      // Payments received before startDate reduce the balance
      const priorPaymentsReceived = await db
        .select({ amount: payment.amount })
        .from(payment)
        .where(
          and(
            eq(payment.organizationId, ctx.organizationId),
            eq(payment.contactId, id),
            eq(payment.type, "received"),
            lt(payment.date, startDate),
            isNull(payment.deletedAt)
          )
        );
      openingBalance -= priorPaymentsReceived.reduce(
        (s, r) => s + r.amount,
        0
      );
    }

    // Bills before startDate (we owe supplier - tracked as negative from their perspective)
    if (isSupplier) {
      const priorBills = await db
        .select({ total: bill.amountDue })
        .from(bill)
        .where(
          and(
            eq(bill.organizationId, ctx.organizationId),
            eq(bill.contactId, id),
            lt(bill.issueDate, startDate),
            notInArray(bill.status, ["draft", "void"]),
            isNull(bill.deletedAt)
          )
        );
      openingBalance -= priorBills.reduce((s, r) => s + r.total, 0);

      // Debit notes before startDate reduce what we owe
      const priorDebits = await db
        .select({ total: debitNote.total })
        .from(debitNote)
        .where(
          and(
            eq(debitNote.organizationId, ctx.organizationId),
            eq(debitNote.contactId, id),
            lt(debitNote.issueDate, startDate),
            notInArray(debitNote.status, ["draft", "void"]),
            isNull(debitNote.deletedAt)
          )
        );
      openingBalance += priorDebits.reduce((s, r) => s + r.total, 0);

      // Payments made before startDate reduce what we owe
      const priorPaymentsMade = await db
        .select({ amount: payment.amount })
        .from(payment)
        .where(
          and(
            eq(payment.organizationId, ctx.organizationId),
            eq(payment.contactId, id),
            eq(payment.type, "made"),
            lt(payment.date, startDate),
            isNull(payment.deletedAt)
          )
        );
      openingBalance += priorPaymentsMade.reduce((s, r) => s + r.amount, 0);
    }

    // ---------- Transactions within date range ----------
    const transactions: StatementTransaction[] = [];

    // Invoices in range
    if (isCustomer) {
      const invoicesInRange = await db
        .select()
        .from(invoice)
        .where(
          and(
            eq(invoice.organizationId, ctx.organizationId),
            eq(invoice.contactId, id),
            gte(invoice.issueDate, startDate),
            lte(invoice.issueDate, endDate),
            notInArray(invoice.status, ["draft", "void"]),
            isNull(invoice.deletedAt)
          )
        );

      for (const inv of invoicesInRange) {
        transactions.push({
          date: inv.issueDate,
          type: "invoice",
          documentNumber: inv.invoiceNumber,
          description: inv.reference || `Invoice ${inv.invoiceNumber}`,
          debit: inv.total,
          credit: 0,
          balance: 0, // calculated later
        });
      }

      // Credit notes in range
      const creditNotesInRange = await db
        .select()
        .from(creditNote)
        .where(
          and(
            eq(creditNote.organizationId, ctx.organizationId),
            eq(creditNote.contactId, id),
            gte(creditNote.issueDate, startDate),
            lte(creditNote.issueDate, endDate),
            notInArray(creditNote.status, ["draft", "void"]),
            isNull(creditNote.deletedAt)
          )
        );

      for (const cn of creditNotesInRange) {
        transactions.push({
          date: cn.issueDate,
          type: "credit_note",
          documentNumber: cn.creditNoteNumber,
          description: cn.reference || `Credit Note ${cn.creditNoteNumber}`,
          debit: 0,
          credit: cn.total,
          balance: 0,
        });
      }

      // Payments received in range
      const paymentsReceived = await db
        .select()
        .from(payment)
        .where(
          and(
            eq(payment.organizationId, ctx.organizationId),
            eq(payment.contactId, id),
            eq(payment.type, "received"),
            gte(payment.date, startDate),
            lte(payment.date, endDate),
            isNull(payment.deletedAt)
          )
        );

      for (const p of paymentsReceived) {
        transactions.push({
          date: p.date,
          type: "payment",
          documentNumber: p.paymentNumber,
          description: p.reference || `Payment ${p.paymentNumber}`,
          debit: 0,
          credit: p.amount,
          balance: 0,
        });
      }
    }

    // Bills in range
    if (isSupplier) {
      const billsInRange = await db
        .select()
        .from(bill)
        .where(
          and(
            eq(bill.organizationId, ctx.organizationId),
            eq(bill.contactId, id),
            gte(bill.issueDate, startDate),
            lte(bill.issueDate, endDate),
            notInArray(bill.status, ["draft", "void"]),
            isNull(bill.deletedAt)
          )
        );

      for (const b of billsInRange) {
        transactions.push({
          date: b.issueDate,
          type: "bill",
          documentNumber: b.billNumber,
          description: b.reference || `Bill ${b.billNumber}`,
          debit: 0,
          credit: b.total,
          balance: 0,
        });
      }

      // Debit notes in range
      const debitNotesInRange = await db
        .select()
        .from(debitNote)
        .where(
          and(
            eq(debitNote.organizationId, ctx.organizationId),
            eq(debitNote.contactId, id),
            gte(debitNote.issueDate, startDate),
            lte(debitNote.issueDate, endDate),
            notInArray(debitNote.status, ["draft", "void"]),
            isNull(debitNote.deletedAt)
          )
        );

      for (const dn of debitNotesInRange) {
        transactions.push({
          date: dn.issueDate,
          type: "debit_note",
          documentNumber: dn.debitNoteNumber,
          description: dn.reference || `Debit Note ${dn.debitNoteNumber}`,
          debit: dn.total,
          credit: 0,
          balance: 0,
        });
      }

      // Payments made in range
      const paymentsMade = await db
        .select()
        .from(payment)
        .where(
          and(
            eq(payment.organizationId, ctx.organizationId),
            eq(payment.contactId, id),
            eq(payment.type, "made"),
            gte(payment.date, startDate),
            lte(payment.date, endDate),
            isNull(payment.deletedAt)
          )
        );

      for (const p of paymentsMade) {
        transactions.push({
          date: p.date,
          type: "payment",
          documentNumber: p.paymentNumber,
          description: p.reference || `Payment ${p.paymentNumber}`,
          debit: p.amount,
          credit: 0,
          balance: 0,
        });
      }
    }

    // Sort by date, then by type priority (invoices/bills first, then credits, then payments)
    const typePriority: Record<string, number> = {
      invoice: 0,
      bill: 0,
      credit_note: 1,
      debit_note: 1,
      payment: 2,
    };
    transactions.sort((a, b) => {
      const dateCmp = a.date.localeCompare(b.date);
      if (dateCmp !== 0) return dateCmp;
      return (typePriority[a.type] ?? 0) - (typePriority[b.type] ?? 0);
    });

    // Calculate running balance
    let runningBalance = openingBalance;
    for (const tx of transactions) {
      runningBalance += tx.debit - tx.credit;
      tx.balance = runningBalance;
    }

    return NextResponse.json({
      contact: {
        id: c.id,
        name: c.name,
        email: c.email,
        type: c.type,
      },
      startDate,
      endDate,
      openingBalance,
      transactions,
      closingBalance: runningBalance,
    });
  } catch (err) {
    return handleError(err);
  }
}
