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
  emailConfig,
} from "@/lib/db/schema";
import { eq, and, gte, lte, lt, notInArray, isNull } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError, notFound, error } from "@/lib/api/response";
import { formatMoney } from "@/lib/money";
import { sendEmail } from "@/lib/email/smtp-client";

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

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getAuthContext(request);
    const { id } = await params;
    const body = await request.json();
    const { startDate: bodyStartDate, endDate: bodyEndDate } = body;

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

    if (!c.email) {
      return error("Contact does not have an email address", 400);
    }

    // Fetch email config
    const emailCfg = await db.query.emailConfig.findFirst({
      where: eq(emailConfig.organizationId, ctx.organizationId),
    });

    if (!emailCfg) {
      return error("Email not configured. Please set up SMTP settings first.", 400);
    }

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

    const startDate = bodyStartDate || defaultStart;
    const endDate = bodyEndDate || defaultEnd;

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

    // Build email HTML
    const transactionRows = transactions
      .map(
        (tx) => `
        <tr>
          <td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:12px;">${formatDate(tx.date)}</td>
          <td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:12px;">${typeLabels[tx.type] || tx.type}</td>
          <td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:12px;">${tx.documentNumber}</td>
          <td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:12px;">${tx.description}</td>
          <td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:12px;text-align:right;font-family:monospace;">${tx.debit ? fmtMoney(tx.debit) : "-"}</td>
          <td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:12px;text-align:right;font-family:monospace;">${tx.credit ? fmtMoney(tx.credit) : "-"}</td>
          <td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:12px;text-align:right;font-family:monospace;">${fmtMoney(tx.balance)}</td>
        </tr>`
      )
      .join("\n");

    const emailHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8" /></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111;padding:0;margin:0;">
  <div style="max-width:700px;margin:0 auto;padding:32px 20px;">
    <h1 style="font-size:20px;font-weight:700;margin:0 0 4px;">Statement</h1>
    <p style="font-size:13px;color:#666;margin:0 0 24px;">${orgName}</p>

    <table style="width:100%;margin-bottom:16px;" cellpadding="0" cellspacing="0">
      <tr>
        <td style="font-size:13px;"><strong>${c.name}</strong></td>
        <td style="font-size:12px;text-align:right;color:#666;">
          ${formatDate(startDate)} to ${formatDate(endDate)}
        </td>
      </tr>
    </table>

    <table style="width:100%;border-collapse:collapse;margin-bottom:24px;" cellpadding="0" cellspacing="0">
      <thead>
        <tr style="background:#f5f5f5;">
          <th style="padding:8px;text-align:left;font-size:10px;text-transform:uppercase;color:#888;font-weight:500;border-bottom:1px solid #ddd;">Date</th>
          <th style="padding:8px;text-align:left;font-size:10px;text-transform:uppercase;color:#888;font-weight:500;border-bottom:1px solid #ddd;">Type</th>
          <th style="padding:8px;text-align:left;font-size:10px;text-transform:uppercase;color:#888;font-weight:500;border-bottom:1px solid #ddd;">Ref</th>
          <th style="padding:8px;text-align:left;font-size:10px;text-transform:uppercase;color:#888;font-weight:500;border-bottom:1px solid #ddd;">Description</th>
          <th style="padding:8px;text-align:right;font-size:10px;text-transform:uppercase;color:#888;font-weight:500;border-bottom:1px solid #ddd;">Debit</th>
          <th style="padding:8px;text-align:right;font-size:10px;text-transform:uppercase;color:#888;font-weight:500;border-bottom:1px solid #ddd;">Credit</th>
          <th style="padding:8px;text-align:right;font-size:10px;text-transform:uppercase;color:#888;font-weight:500;border-bottom:1px solid #ddd;">Balance</th>
        </tr>
      </thead>
      <tbody>
        <tr style="background:#f9f9f9;">
          <td colspan="6" style="padding:8px;font-size:12px;font-weight:600;border-bottom:1px solid #eee;">Opening Balance</td>
          <td style="padding:8px;font-size:12px;font-weight:600;text-align:right;font-family:monospace;border-bottom:1px solid #eee;">${fmtMoney(openingBalance)}</td>
        </tr>
        ${transactionRows}
        <tr style="background:#f9f9f9;">
          <td colspan="6" style="padding:8px;font-size:12px;font-weight:600;border-bottom:1px solid #ddd;">Closing Balance</td>
          <td style="padding:8px;font-size:12px;font-weight:600;text-align:right;font-family:monospace;border-bottom:1px solid #ddd;">${fmtMoney(closingBalance)}</td>
        </tr>
      </tbody>
    </table>

    <table style="width:100%;border-collapse:collapse;background:#f5f5f5;border-radius:6px;" cellpadding="12" cellspacing="0">
      <tr>
        <td style="text-align:center;">
          <div style="font-size:10px;text-transform:uppercase;color:#888;">Opening</div>
          <div style="font-size:14px;font-weight:600;font-family:monospace;">${fmtMoney(openingBalance)}</div>
        </td>
        <td style="text-align:center;">
          <div style="font-size:10px;text-transform:uppercase;color:#888;">Debited</div>
          <div style="font-size:14px;font-weight:600;font-family:monospace;">${fmtMoney(totalDebit)}</div>
        </td>
        <td style="text-align:center;">
          <div style="font-size:10px;text-transform:uppercase;color:#888;">Credited</div>
          <div style="font-size:14px;font-weight:600;font-family:monospace;">${fmtMoney(totalCredit)}</div>
        </td>
        <td style="text-align:center;">
          <div style="font-size:10px;text-transform:uppercase;color:#888;">Closing</div>
          <div style="font-size:14px;font-weight:600;font-family:monospace;">${fmtMoney(closingBalance)}</div>
        </td>
      </tr>
    </table>

    <p style="font-size:11px;color:#999;margin-top:24px;">
      This statement was generated on ${formatDate(now.toISOString().slice(0, 10))} by ${orgName}.
    </p>
  </div>
</body>
</html>`;

    await sendEmail(emailCfg, {
      to: c.email,
      subject: `Statement from ${orgName} - ${formatDate(startDate)} to ${formatDate(endDate)}`,
      html: emailHtml,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
