import { db } from "@/lib/db";
import {
  contact,
  invoice,
  creditNote,
  bill,
  debitNote,
  payment,
  paymentAllocation,
  organization,
  emailConfig,
} from "@/lib/db/schema";
import { eq, and, gte, lte, lt, notInArray, inArray, isNull, type SQL } from "drizzle-orm";
import { formatMoney } from "@/lib/money";
import { sendEmail } from "@/lib/email/smtp-client";
import { toPdf } from "@/lib/reports/statement-export";

export interface StatementTransaction {
  date: string;
  type: "invoice" | "credit_note" | "payment" | "bill" | "debit_note";
  documentNumber: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
}

export interface ContactStatement {
  contact: { id: string; name: string; email: string | null; type: string };
  startDate: string;
  endDate: string;
  openingBalance: number;
  transactions: StatementTransaction[];
  closingBalance: number;
}

export class StatementError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

const NOT_POSTED = ["draft", "void"] as const;
// Invoices/bills awaiting (or rejected in) approval aren't posted either.
const INVOICE_NOT_POSTED = [...NOT_POSTED, "pending_approval", "rejected"] as const;
const BILL_NOT_POSTED = [...NOT_POSTED, "pending_approval"] as const;

function defaultRange() {
  const now = new Date();
  return {
    start: `${now.getFullYear() - 1}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`,
    end: now.toISOString().slice(0, 10),
  };
}

/**
 * Account statement for a contact over a date range (default: the last 12
 * months). Customers: invoices are debits, credit notes and payments received
 * are credits. Suppliers: bills are credits, debit notes and payments made are
 * debits. A positive balance means the contact owes you. All amounts in
 * integer cents. Returns null when the contact isn't in the organization.
 */
export async function buildContactStatement(
  organizationId: string,
  contactId: string,
  startDateParam?: string | null,
  endDateParam?: string | null
): Promise<ContactStatement | null> {
  const [c] = await db
    .select()
    .from(contact)
    .where(and(eq(contact.id, contactId), eq(contact.organizationId, organizationId), isNull(contact.deletedAt)))
    .limit(1);
  if (!c) return null;

  // Credit/debit-note APPLICATIONS are recorded as zero-cash "carrier"
  // payments. They must not count as cash (the note itself is already on the
  // statement) or the balance would drop twice.
  const carrierRows = await db
    .selectDistinct({ paymentId: paymentAllocation.paymentId })
    .from(paymentAllocation)
    .innerJoin(payment, eq(paymentAllocation.paymentId, payment.id))
    .where(
      and(
        eq(payment.organizationId, organizationId),
        eq(payment.contactId, contactId),
        inArray(paymentAllocation.documentType, ["credit_note", "debit_note"])
      )
    );
  const carrierIds = carrierRows.map((r) => r.paymentId);
  const excludeCarriers: SQL | undefined = carrierIds.length ? notInArray(payment.id, carrierIds) : undefined;

  const range = defaultRange();
  const startDate = startDateParam || range.start;
  const endDate = endDateParam || range.end;
  const isCustomer = c.type === "customer" || c.type === "both";
  const isSupplier = c.type === "supplier" || c.type === "both";

  const sum = (rows: { v: number }[]) => rows.reduce((s, r) => s + r.v, 0);
  let openingBalance = 0;
  const transactions: StatementTransaction[] = [];

  if (isCustomer) {
    const [priorInvoices, priorCredits, priorReceived, invoices, credits, received] = await Promise.all([
      db.select({ v: invoice.total }).from(invoice).where(and(eq(invoice.organizationId, organizationId), eq(invoice.contactId, contactId), lt(invoice.issueDate, startDate), notInArray(invoice.status, [...INVOICE_NOT_POSTED]), isNull(invoice.deletedAt))),
      db.select({ v: creditNote.total }).from(creditNote).where(and(eq(creditNote.organizationId, organizationId), eq(creditNote.contactId, contactId), lt(creditNote.issueDate, startDate), notInArray(creditNote.status, [...NOT_POSTED]), isNull(creditNote.deletedAt))),
      db.select({ v: payment.amount }).from(payment).where(and(eq(payment.organizationId, organizationId), eq(payment.contactId, contactId), eq(payment.type, "received"), lt(payment.date, startDate), isNull(payment.deletedAt), excludeCarriers)),
      db.select().from(invoice).where(and(eq(invoice.organizationId, organizationId), eq(invoice.contactId, contactId), gte(invoice.issueDate, startDate), lte(invoice.issueDate, endDate), notInArray(invoice.status, [...INVOICE_NOT_POSTED]), isNull(invoice.deletedAt))),
      db.select().from(creditNote).where(and(eq(creditNote.organizationId, organizationId), eq(creditNote.contactId, contactId), gte(creditNote.issueDate, startDate), lte(creditNote.issueDate, endDate), notInArray(creditNote.status, [...NOT_POSTED]), isNull(creditNote.deletedAt))),
      db.select().from(payment).where(and(eq(payment.organizationId, organizationId), eq(payment.contactId, contactId), eq(payment.type, "received"), gte(payment.date, startDate), lte(payment.date, endDate), isNull(payment.deletedAt), excludeCarriers)),
    ]);
    // Invoices at their full total: payments and credit notes are subtracted
    // separately (using amountDue here would count them twice).
    openingBalance += sum(priorInvoices) - sum(priorCredits) - sum(priorReceived);
    for (const inv of invoices) {
      transactions.push({ date: inv.issueDate, type: "invoice", documentNumber: inv.invoiceNumber, description: inv.reference || `Invoice ${inv.invoiceNumber}`, debit: inv.total, credit: 0, balance: 0 });
    }
    for (const cn of credits) {
      transactions.push({ date: cn.issueDate, type: "credit_note", documentNumber: cn.creditNoteNumber, description: cn.reference || `Credit Note ${cn.creditNoteNumber}`, debit: 0, credit: cn.total, balance: 0 });
    }
    for (const p of received) {
      transactions.push({ date: p.date, type: "payment", documentNumber: p.paymentNumber, description: p.reference || `Payment ${p.paymentNumber}`, debit: 0, credit: p.amount, balance: 0 });
    }
  }

  if (isSupplier) {
    const [priorBills, priorDebits, priorMade, bills, debits, made] = await Promise.all([
      db.select({ v: bill.total }).from(bill).where(and(eq(bill.organizationId, organizationId), eq(bill.contactId, contactId), lt(bill.issueDate, startDate), notInArray(bill.status, [...BILL_NOT_POSTED]), isNull(bill.deletedAt))),
      db.select({ v: debitNote.total }).from(debitNote).where(and(eq(debitNote.organizationId, organizationId), eq(debitNote.contactId, contactId), lt(debitNote.issueDate, startDate), notInArray(debitNote.status, [...NOT_POSTED]), isNull(debitNote.deletedAt))),
      db.select({ v: payment.amount }).from(payment).where(and(eq(payment.organizationId, organizationId), eq(payment.contactId, contactId), eq(payment.type, "made"), lt(payment.date, startDate), isNull(payment.deletedAt), excludeCarriers)),
      db.select().from(bill).where(and(eq(bill.organizationId, organizationId), eq(bill.contactId, contactId), gte(bill.issueDate, startDate), lte(bill.issueDate, endDate), notInArray(bill.status, [...BILL_NOT_POSTED]), isNull(bill.deletedAt))),
      db.select().from(debitNote).where(and(eq(debitNote.organizationId, organizationId), eq(debitNote.contactId, contactId), gte(debitNote.issueDate, startDate), lte(debitNote.issueDate, endDate), notInArray(debitNote.status, [...NOT_POSTED]), isNull(debitNote.deletedAt))),
      db.select().from(payment).where(and(eq(payment.organizationId, organizationId), eq(payment.contactId, contactId), eq(payment.type, "made"), gte(payment.date, startDate), lte(payment.date, endDate), isNull(payment.deletedAt), excludeCarriers)),
    ]);
    openingBalance += -sum(priorBills) + sum(priorDebits) + sum(priorMade);
    for (const b of bills) {
      transactions.push({ date: b.issueDate, type: "bill", documentNumber: b.billNumber, description: b.reference || `Bill ${b.billNumber}`, debit: 0, credit: b.total, balance: 0 });
    }
    for (const dn of debits) {
      transactions.push({ date: dn.issueDate, type: "debit_note", documentNumber: dn.debitNoteNumber, description: dn.reference || `Debit Note ${dn.debitNoteNumber}`, debit: dn.total, credit: 0, balance: 0 });
    }
    for (const p of made) {
      transactions.push({ date: p.date, type: "payment", documentNumber: p.paymentNumber, description: p.reference || `Payment ${p.paymentNumber}`, debit: p.amount, credit: 0, balance: 0 });
    }
  }

  // Date order; on the same day documents first, then notes, then payments.
  const priority: Record<string, number> = { invoice: 0, bill: 0, credit_note: 1, debit_note: 1, payment: 2 };
  transactions.sort((a, b) => a.date.localeCompare(b.date) || (priority[a.type] ?? 0) - (priority[b.type] ?? 0));

  let running = openingBalance;
  for (const tx of transactions) {
    running += tx.debit - tx.credit;
    tx.balance = running;
  }

  return {
    contact: { id: c.id, name: c.name, email: c.email, type: c.type },
    startDate,
    endDate,
    openingBalance,
    transactions,
    closingBalance: running,
  };
}

const TYPE_LABELS: Record<string, string> = {
  invoice: "Invoice",
  credit_note: "Credit Note",
  payment: "Payment",
  bill: "Bill",
  debit_note: "Debit Note",
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const fmtDate = (d: string) =>
  new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

function renderStatementHtml(s: ContactStatement, orgName: string, currency: string) {
  const money = (minorUnits: number) => formatMoney(minorUnits, currency);
  const totalDebit = s.transactions.reduce((t, x) => t + x.debit, 0);
  const totalCredit = s.transactions.reduce((t, x) => t + x.credit, 0);
  const td = "padding:6px 8px;border-bottom:1px solid #eee;font-size:12px;";
  const num = `${td}text-align:right;font-family:monospace;`;
  const th = "padding:8px;font-size:10px;text-transform:uppercase;color:#888;font-weight:500;border-bottom:1px solid #ddd;";
  const rows = s.transactions
    .map(
      (tx) => `<tr><td style="${td}">${fmtDate(tx.date)}</td><td style="${td}">${TYPE_LABELS[tx.type] || tx.type}</td><td style="${td}">${esc(tx.documentNumber)}</td><td style="${td}">${esc(tx.description)}</td><td style="${num}">${tx.debit ? money(tx.debit) : "-"}</td><td style="${num}">${tx.credit ? money(tx.credit) : "-"}</td><td style="${num}">${money(tx.balance)}</td></tr>`
    )
    .join("\n");
  const tile = (label: string, cents: number) =>
    `<td style="text-align:center;"><div style="font-size:10px;text-transform:uppercase;color:#888;">${label}</div><div style="font-size:14px;font-weight:600;font-family:monospace;">${money(cents)}</div></td>`;

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8" /></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111;padding:0;margin:0;">
  <div style="max-width:700px;margin:0 auto;padding:32px 20px;">
    <h1 style="font-size:20px;font-weight:700;margin:0 0 4px;">Statement</h1>
    <p style="font-size:13px;color:#666;margin:0 0 24px;">${esc(orgName)}</p>
    <table style="width:100%;margin-bottom:16px;" cellpadding="0" cellspacing="0"><tr>
      <td style="font-size:13px;"><strong>${esc(s.contact.name)}</strong></td>
      <td style="font-size:12px;text-align:right;color:#666;">${fmtDate(s.startDate)} to ${fmtDate(s.endDate)}</td>
    </tr></table>
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px;" cellpadding="0" cellspacing="0">
      <thead><tr style="background:#f5f5f5;">
        <th style="${th}text-align:left;">Date</th><th style="${th}text-align:left;">Type</th><th style="${th}text-align:left;">Ref</th><th style="${th}text-align:left;">Description</th>
        <th style="${th}text-align:right;">Debit</th><th style="${th}text-align:right;">Credit</th><th style="${th}text-align:right;">Balance</th>
      </tr></thead>
      <tbody>
        <tr style="background:#f9f9f9;"><td colspan="6" style="padding:8px;font-size:12px;font-weight:600;border-bottom:1px solid #eee;">Opening Balance</td><td style="padding:8px;font-size:12px;font-weight:600;text-align:right;font-family:monospace;border-bottom:1px solid #eee;">${money(s.openingBalance)}</td></tr>
        ${rows}
        <tr style="background:#f9f9f9;"><td colspan="6" style="padding:8px;font-size:12px;font-weight:600;border-bottom:1px solid #ddd;">Closing Balance</td><td style="padding:8px;font-size:12px;font-weight:600;text-align:right;font-family:monospace;border-bottom:1px solid #ddd;">${money(s.closingBalance)}</td></tr>
      </tbody>
    </table>
    <table style="width:100%;border-collapse:collapse;background:#f5f5f5;border-radius:6px;" cellpadding="12" cellspacing="0"><tr>
      ${tile("Opening", s.openingBalance)}${tile("Debited", totalDebit)}${tile("Credited", totalCredit)}${tile("Closing", s.closingBalance)}
    </tr></table>
    <p style="font-size:11px;color:#999;margin-top:24px;">This statement was generated on ${fmtDate(new Date().toISOString().slice(0, 10))} by ${esc(orgName)}.</p>
  </div>
</body></html>`;
}

/**
 * Email a contact their statement using the organization's SMTP settings.
 * Throws StatementError (with an HTTP-ish status) when the contact is missing,
 * has no email, or email isn't configured.
 */
export async function emailContactStatement(
  organizationId: string,
  contactId: string,
  startDate?: string | null,
  endDate?: string | null
) {
  const statement = await buildContactStatement(organizationId, contactId, startDate, endDate);
  if (!statement) throw new StatementError("Contact not found", 404);
  if (!statement.contact.email) throw new StatementError("Contact does not have an email address", 400);

  const cfg = await db.query.emailConfig.findFirst({ where: eq(emailConfig.organizationId, organizationId) });
  if (!cfg) throw new StatementError("Email not configured. Please set up SMTP settings first.", 400);

  const [[org], [c]] = await Promise.all([
    db.select({ name: organization.name }).from(organization).where(eq(organization.id, organizationId)).limit(1),
    db.select({ currencyCode: contact.currencyCode }).from(contact).where(eq(contact.id, contactId)).limit(1),
  ]);
  const orgName = org?.name || "Organization";

  await sendEmail(cfg, {
    to: statement.contact.email,
    subject: `Statement from ${orgName} - ${fmtDate(statement.startDate)} to ${fmtDate(statement.endDate)}`,
    html: renderStatementHtml(statement, orgName, c?.currencyCode || "USD"),
  });

  return {
    sentTo: statement.contact.email,
    startDate: statement.startDate,
    endDate: statement.endDate,
    closingBalance: statement.closingBalance,
  };
}

/**
 * Render a contact's statement as a real PDF file (via the shared report
 * exporter). Returns null when the contact isn't in the organization.
 */
export async function renderContactStatementPdf(
  organizationId: string,
  contactId: string,
  startDate?: string | null,
  endDate?: string | null
): Promise<{ pdf: Buffer; filename: string } | null> {
  const s = await buildContactStatement(organizationId, contactId, startDate, endDate);
  if (!s) return null;
  const [[org], [c]] = await Promise.all([
    db.select({ name: organization.name }).from(organization).where(eq(organization.id, organizationId)).limit(1),
    db.select({ currencyCode: contact.currencyCode }).from(contact).where(eq(contact.id, contactId)).limit(1),
  ]);
  const totalDebit = s.transactions.reduce((t, x) => t + x.debit, 0);
  const totalCredit = s.transactions.reduce((t, x) => t + x.credit, 0);
  const pdf = await toPdf({
    title: `Statement — ${s.contact.name}`,
    periodLabel: `${org?.name || "Organization"} · ${fmtDate(s.startDate)} to ${fmtDate(s.endDate)}`,
    currency: c?.currencyCode || "USD",
    columns: ["Debit", "Credit", "Balance"],
    sections: [
      {
        label: "Transactions",
        rows: [
          { name: "Opening Balance", amounts: [0, 0, s.openingBalance], depth: 0, bold: true },
          ...s.transactions.map((tx) => ({
            name: `${fmtDate(tx.date)} · ${TYPE_LABELS[tx.type] || tx.type} ${tx.documentNumber} — ${tx.description}`,
            amounts: [tx.debit, tx.credit, tx.balance],
            depth: 0,
          })),
        ],
        subtotals: [totalDebit, totalCredit, s.closingBalance],
      },
    ],
  });
  const slug = s.contact.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "contact";
  return { pdf, filename: `statement-${slug}-${s.endDate}.pdf` };
}
