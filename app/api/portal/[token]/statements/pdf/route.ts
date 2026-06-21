import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  portalAccessToken,
  contact,
  invoice,
  creditNote,
  bill,
  debitNote,
  payment,
  paymentAllocation,
  organization,
} from "@/lib/db/schema";
import {
  eq,
  and,
  gte,
  lte,
  lt,
  inArray,
  notInArray,
  isNull,
} from "drizzle-orm";
import { notFound, error, handleError } from "@/lib/api/response";
import { toPdf, type Statement } from "@/lib/reports/statement-export";

interface StatementTransaction {
  date: string;
  type: "invoice" | "credit_note" | "payment" | "bill" | "debit_note";
  documentNumber: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
}

const typeLabels: Record<string, string> = {
  invoice: "Invoice",
  credit_note: "Credit Note",
  payment: "Payment",
  bill: "Bill",
  debit_note: "Debit Note",
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const url = new URL(request.url);

    // Authenticate via the portal token (mirrors the invoices portal PDF route).
    const access = await db.query.portalAccessToken.findFirst({
      where: and(
        eq(portalAccessToken.token, token),
        isNull(portalAccessToken.revokedAt)
      ),
    });

    if (!access) return notFound("Portal access");
    if (access.expiresAt && access.expiresAt < new Date()) {
      return error("Portal link has expired", 410);
    }

    const organizationId = access.organizationId;
    const id = access.contactId;

    // Fetch contact
    const contactRow = await db
      .select()
      .from(contact)
      .where(
        and(
          eq(contact.id, id),
          eq(contact.organizationId, organizationId),
          isNull(contact.deletedAt)
        )
      )
      .limit(1);

    if (!contactRow.length) {
      return notFound("Contact");
    }

    const c = contactRow[0];

    // Credit/debit-note APPLICATIONS are recorded as zero-cash "carrier"
    // payments so an allocation can link note -> document. They must NOT be
    // counted as cash here — the note document itself is already in the
    // statement — or the balance is reduced twice. Exclude those carriers.
    const carrierPaymentRows = await db
      .selectDistinct({ paymentId: paymentAllocation.paymentId })
      .from(paymentAllocation)
      .innerJoin(payment, eq(paymentAllocation.paymentId, payment.id))
      .where(
        and(
          eq(payment.organizationId, organizationId),
          eq(payment.contactId, id),
          inArray(paymentAllocation.documentType, ["credit_note", "debit_note"])
        )
      );
    const carrierPaymentIds = carrierPaymentRows.map((r) => r.paymentId);
    const excludeCarriers = carrierPaymentIds.length
      ? notInArray(payment.id, carrierPaymentIds)
      : undefined;

    // Fetch org name
    const orgRow = await db
      .select({ name: organization.name })
      .from(organization)
      .where(eq(organization.id, organizationId))
      .limit(1);

    const orgName = orgRow[0]?.name || "Organization";

    const now = new Date();
    const defaultStart = `${now.getFullYear() - 1}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const defaultEnd = now.toISOString().slice(0, 10);

    const startDate = url.searchParams.get("startDate") || defaultStart;
    const endDate = url.searchParams.get("endDate") || defaultEnd;

    const isCustomer = c.type === "customer" || c.type === "both";
    const isSupplier = c.type === "supplier" || c.type === "both";

    // ---------- Opening balance ----------
    let openingBalance = 0;

    if (isCustomer) {
      const priorInvoices = await db
        .select({ total: invoice.amountDue })
        .from(invoice)
        .where(
          and(
            eq(invoice.organizationId, organizationId),
            eq(invoice.contactId, id),
            lt(invoice.issueDate, startDate),
            notInArray(invoice.status, ["draft", "void"]),
            isNull(invoice.deletedAt)
          )
        );
      openingBalance += priorInvoices.reduce((s, r) => s + r.total, 0);

      const priorCredits = await db
        .select({ total: creditNote.total })
        .from(creditNote)
        .where(
          and(
            eq(creditNote.organizationId, organizationId),
            eq(creditNote.contactId, id),
            lt(creditNote.issueDate, startDate),
            notInArray(creditNote.status, ["draft", "void"]),
            isNull(creditNote.deletedAt)
          )
        );
      openingBalance -= priorCredits.reduce((s, r) => s + r.total, 0);

      const priorPaymentsReceived = await db
        .select({ amount: payment.amount })
        .from(payment)
        .where(
          and(
            eq(payment.organizationId, organizationId),
            eq(payment.contactId, id),
            eq(payment.type, "received"),
            lt(payment.date, startDate),
            isNull(payment.deletedAt),
            excludeCarriers
          )
        );
      openingBalance -= priorPaymentsReceived.reduce((s, r) => s + r.amount, 0);
    }

    if (isSupplier) {
      const priorBills = await db
        .select({ total: bill.amountDue })
        .from(bill)
        .where(
          and(
            eq(bill.organizationId, organizationId),
            eq(bill.contactId, id),
            lt(bill.issueDate, startDate),
            notInArray(bill.status, ["draft", "void"]),
            isNull(bill.deletedAt)
          )
        );
      openingBalance -= priorBills.reduce((s, r) => s + r.total, 0);

      const priorDebits = await db
        .select({ total: debitNote.total })
        .from(debitNote)
        .where(
          and(
            eq(debitNote.organizationId, organizationId),
            eq(debitNote.contactId, id),
            lt(debitNote.issueDate, startDate),
            notInArray(debitNote.status, ["draft", "void"]),
            isNull(debitNote.deletedAt)
          )
        );
      openingBalance += priorDebits.reduce((s, r) => s + r.total, 0);

      const priorPaymentsMade = await db
        .select({ amount: payment.amount })
        .from(payment)
        .where(
          and(
            eq(payment.organizationId, organizationId),
            eq(payment.contactId, id),
            eq(payment.type, "made"),
            lt(payment.date, startDate),
            isNull(payment.deletedAt),
            excludeCarriers
          )
        );
      openingBalance += priorPaymentsMade.reduce((s, r) => s + r.amount, 0);
    }

    // ---------- Transactions ----------
    const transactions: StatementTransaction[] = [];

    if (isCustomer) {
      const invoicesInRange = await db
        .select()
        .from(invoice)
        .where(
          and(
            eq(invoice.organizationId, organizationId),
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
          balance: 0,
        });
      }

      const creditNotesInRange = await db
        .select()
        .from(creditNote)
        .where(
          and(
            eq(creditNote.organizationId, organizationId),
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

      const paymentsReceived = await db
        .select()
        .from(payment)
        .where(
          and(
            eq(payment.organizationId, organizationId),
            eq(payment.contactId, id),
            eq(payment.type, "received"),
            gte(payment.date, startDate),
            lte(payment.date, endDate),
            isNull(payment.deletedAt),
            excludeCarriers
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

    if (isSupplier) {
      const billsInRange = await db
        .select()
        .from(bill)
        .where(
          and(
            eq(bill.organizationId, organizationId),
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

      const debitNotesInRange = await db
        .select()
        .from(debitNote)
        .where(
          and(
            eq(debitNote.organizationId, organizationId),
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

      const paymentsMade = await db
        .select()
        .from(payment)
        .where(
          and(
            eq(payment.organizationId, organizationId),
            eq(payment.contactId, id),
            eq(payment.type, "made"),
            gte(payment.date, startDate),
            lte(payment.date, endDate),
            isNull(payment.deletedAt),
            excludeCarriers
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

    // Sort
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

    const totalDebit = transactions.reduce((s, t) => s + t.debit, 0);
    const totalCredit = transactions.reduce((s, t) => s + t.credit, 0);
    const closingBalance = runningBalance;

    const formatDate = (d: string) => {
      const dt = new Date(d + "T00:00:00");
      return dt.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    };

    // Serialize the contact ledger into the shared Statement shape and render a
    // PDF via the same @react-pdf path used by other report exports.
    const currency = c.currencyCode || "USD";

    const statement: Statement = {
      title: `Statement — ${c.name}`,
      periodLabel: `${orgName} · ${formatDate(startDate)} to ${formatDate(endDate)}`,
      currency,
      columns: ["Debit", "Credit", "Balance"],
      sections: [
        {
          label: "Transactions",
          rows: [
            {
              name: "Opening Balance",
              amounts: [0, 0, openingBalance],
              depth: 0,
              bold: true,
            },
            ...transactions.map((tx) => ({
              name: `${formatDate(tx.date)} · ${typeLabels[tx.type] || tx.type} ${tx.documentNumber} — ${tx.description}`,
              amounts: [tx.debit, tx.credit, tx.balance],
              depth: 0,
            })),
          ],
          subtotals: [totalDebit, totalCredit, closingBalance],
        },
      ],
    };

    const pdfBuffer = await toPdf(statement);

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="statement-${c.name}.pdf"`,
      },
    });
  } catch (err) {
    return handleError(err);
  }
}
