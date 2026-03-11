import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  contact,
  invoice,
  creditNote,
  bill,
  debitNote,
  payment,
  organization,
} from "@/lib/db/schema";
import { eq, and, gte, lte, lt, notInArray, isNull } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError, notFound } from "@/lib/api/response";
import { formatMoney } from "@/lib/money";

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
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const url = new URL(request.url);
    const orgIdParam = url.searchParams.get("orgId");
    const ctx = await getAuthContext(request, orgIdParam || undefined);
    const { id } = await params;

    // Fetch contact
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

    // Fetch org name
    const orgRow = await db
      .select({ name: organization.name })
      .from(organization)
      .where(eq(organization.id, ctx.organizationId))
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
            eq(invoice.organizationId, ctx.organizationId),
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
            eq(creditNote.organizationId, ctx.organizationId),
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
            eq(payment.organizationId, ctx.organizationId),
            eq(payment.contactId, id),
            eq(payment.type, "received"),
            lt(payment.date, startDate),
            isNull(payment.deletedAt)
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
            eq(bill.organizationId, ctx.organizationId),
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
            eq(debitNote.organizationId, ctx.organizationId),
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
            eq(payment.organizationId, ctx.organizationId),
            eq(payment.contactId, id),
            eq(payment.type, "made"),
            lt(payment.date, startDate),
            isNull(payment.deletedAt)
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
          balance: 0,
        });
      }

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

    const fmtMoney = (cents: number) => formatMoney(cents);

    // Build HTML
    const transactionRows = transactions
      .map(
        (tx) => `
        <tr>
          <td>${formatDate(tx.date)}</td>
          <td>${typeLabels[tx.type] || tx.type}</td>
          <td>${tx.documentNumber}</td>
          <td>${tx.description}</td>
          <td class="amount">${tx.debit ? fmtMoney(tx.debit) : "-"}</td>
          <td class="amount">${tx.credit ? fmtMoney(tx.credit) : "-"}</td>
          <td class="amount">${fmtMoney(tx.balance)}</td>
        </tr>`
      )
      .join("\n");

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Statement - ${c.name}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; font-size: 12px; color: #111; padding: 40px; max-width: 1000px; margin: 0 auto; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; padding-bottom: 16px; border-bottom: 2px solid #111; }
    .header h1 { font-size: 24px; font-weight: 700; }
    .header .org-name { font-size: 14px; color: #555; margin-top: 4px; }
    .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 24px; }
    .meta-block { }
    .meta-block dt { font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: #888; margin-bottom: 2px; }
    .meta-block dd { font-size: 13px; font-weight: 500; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
    thead th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: #888; padding: 8px 6px; border-bottom: 1px solid #ddd; font-weight: 500; }
    thead th.amount { text-align: right; }
    tbody td { padding: 7px 6px; border-bottom: 1px solid #eee; font-size: 11px; }
    tbody td.amount { text-align: right; font-variant-numeric: tabular-nums; font-family: "SF Mono", SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 11px; }
    .opening-row td, .closing-row td { font-weight: 600; background: #f9f9f9; }
    .summary { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 16px; padding: 16px; background: #f5f5f5; border-radius: 6px; }
    .summary-item { }
    .summary-item .label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: #888; }
    .summary-item .value { font-size: 14px; font-weight: 600; font-variant-numeric: tabular-nums; margin-top: 2px; }
    @media print {
      body { padding: 20px; }
      .no-print { display: none !important; }
      @page { margin: 15mm; }
    }
    .print-btn { position: fixed; top: 16px; right: 16px; padding: 8px 16px; background: #111; color: #fff; border: none; border-radius: 6px; font-size: 13px; cursor: pointer; }
    .print-btn:hover { background: #333; }
  </style>
</head>
<body>
  <button class="print-btn no-print" onclick="window.print()">Print / Save PDF</button>

  <div class="header">
    <div>
      <h1>Statement</h1>
      <div class="org-name">${orgName}</div>
    </div>
    <div style="text-align: right;">
      <div style="font-size: 16px; font-weight: 600;">${c.name}</div>
      ${c.email ? `<div style="font-size: 11px; color: #888;">${c.email}</div>` : ""}
    </div>
  </div>

  <div class="meta">
    <div class="meta-block">
      <dl>
        <dt>Period</dt>
        <dd>${formatDate(startDate)} to ${formatDate(endDate)}</dd>
      </dl>
    </div>
    <div class="meta-block" style="text-align: right;">
      <dl>
        <dt>Generated</dt>
        <dd>${formatDate(now.toISOString().slice(0, 10))}</dd>
      </dl>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Date</th>
        <th>Type</th>
        <th>Reference</th>
        <th>Description</th>
        <th class="amount">Debit</th>
        <th class="amount">Credit</th>
        <th class="amount">Balance</th>
      </tr>
    </thead>
    <tbody>
      <tr class="opening-row">
        <td colspan="6">Opening Balance</td>
        <td class="amount">${fmtMoney(openingBalance)}</td>
      </tr>
      ${transactionRows}
      <tr class="closing-row">
        <td colspan="6">Closing Balance</td>
        <td class="amount">${fmtMoney(closingBalance)}</td>
      </tr>
    </tbody>
  </table>

  <div class="summary">
    <div class="summary-item">
      <div class="label">Opening Balance</div>
      <div class="value">${fmtMoney(openingBalance)}</div>
    </div>
    <div class="summary-item">
      <div class="label">Total Debited</div>
      <div class="value">${fmtMoney(totalDebit)}</div>
    </div>
    <div class="summary-item">
      <div class="label">Total Credited</div>
      <div class="value">${fmtMoney(totalCredit)}</div>
    </div>
    <div class="summary-item">
      <div class="label">Closing Balance</div>
      <div class="value">${fmtMoney(closingBalance)}</div>
    </div>
  </div>
</body>
</html>`;

    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
      },
    });
  } catch (err) {
    return handleError(err);
  }
}
