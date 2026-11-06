import { formatMoney } from "@/lib/money";
import {
  paymentTermsText,
  replacePlaceholders as replaceTemplatePlaceholders,
  safeAccentColor,
  templateBlockText,
} from "./template-text";

interface TemplateSettings {
  logoUrl?: string | null;
  accentColor?: string | null;
  headerHtml?: string | null;
  footerHtml?: string | null;
  showTaxBreakdown?: boolean;
  showPaymentTerms?: boolean;
  notes?: string | null;
  bankDetails?: string | null;
  paymentInstructions?: string | null;
}

interface OrgInfo {
  name: string;
  address?: string | null;
  taxId?: string | null;
  registrationNumber?: string | null;
  phone?: string | null;
  email?: string | null;
  countryCode?: string | null;
}

interface LineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  taxAmount: number;
  amount: number;
}

interface InvoiceData {
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  status: string;
  contactName: string;
  contactEmail?: string | null;
  contactAddress?: string | null;
  contactTaxNumber?: string | null;
  lines: LineItem[];
  subtotal: number;
  taxTotal: number;
  total: number;
  amountPaid?: number;
  amountDue?: number;
  currencyCode: string;
  reference?: string | null;
  notes?: string | null;
}

function getTaxIdLabel(countryCode?: string | null): string {
  if (!countryCode) return "Tax ID";
  const cc = countryCode.toUpperCase();
  const EU = [
    "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR",
    "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL",
    "PL", "PT", "RO", "SK", "SI", "ES", "SE",
  ];
  if (EU.includes(cc) || cc === "GB") return "VAT";
  if (cc === "AU") return "ABN";
  if (cc === "NZ") return "GST";
  if (cc === "CA") return "GST/HST";
  return "Tax ID";
}

function getInvoiceTitle(countryCode?: string | null, hasTaxId?: boolean): string {
  const cc = countryCode?.toUpperCase();
  if ((cc === "AU" || cc === "NZ") && hasTaxId) return "Tax Invoice";
  return "Invoice";
}

// Per-document-type presentation config so we can reuse the invoice template
// for quotes, credit notes, purchase orders and debit notes. PO + debit notes
// are supplier-facing (we are the buyer), so the party blocks swap.
interface DocTypeConfig {
  // Heading shown at the top of the document.
  title: string;
  // Label for the document's identifying number (e.g. "Quote number").
  numberLabel: string;
  // Label for the second date row; null hides it.
  secondDateLabel: string | null;
  // Heading above the counterparty (recipient) block.
  partyLabel: string;
  // When true, the org is the buyer and the counterparty is the supplier,
  // so we render the counterparty as "from" rather than "bill to".
  supplierFacing: boolean;
  // Whether to show the running "amount due / total" headline + totals "amount due" row.
  showAmountDue: boolean;
  // Whether the template's Show Payment Terms switch applies (due date row,
  // "due {date}" headline and the Payment terms line).
  hasPaymentTerms?: boolean;
  // Headline/summary wording when there's no amount due, e.g. "paid {date}".
  summaryNoun?: string;
  // Label for the final totals row when there's no amount due.
  totalLabel?: string;
}

const DOC_CONFIGS: Record<DocumentKind, DocTypeConfig> = {
  invoice: {
    title: "Invoice",
    numberLabel: "Invoice number",
    secondDateLabel: "Date due",
    partyLabel: "Bill to",
    supplierFacing: false,
    showAmountDue: true,
    hasPaymentTerms: true,
  },
  quote: {
    title: "Quote",
    numberLabel: "Quote number",
    secondDateLabel: "Valid until",
    partyLabel: "Prepared for",
    supplierFacing: false,
    showAmountDue: false,
  },
  credit_note: {
    title: "Credit Note",
    numberLabel: "Credit note number",
    secondDateLabel: null,
    partyLabel: "Credit to",
    supplierFacing: false,
    showAmountDue: false,
  },
  purchase_order: {
    title: "Purchase Order",
    numberLabel: "Order number",
    secondDateLabel: "Delivery date",
    partyLabel: "Supplier",
    supplierFacing: true,
    showAmountDue: false,
  },
  debit_note: {
    title: "Debit Note",
    numberLabel: "Debit note number",
    secondDateLabel: null,
    partyLabel: "Supplier",
    supplierFacing: true,
    showAmountDue: false,
  },
  sales_receipt: {
    title: "Receipt",
    numberLabel: "Receipt number",
    secondDateLabel: null,
    partyLabel: "Sold to",
    supplierFacing: false,
    showAmountDue: false,
    summaryNoun: "paid",
    totalLabel: "Total paid",
  },
};

export type DocumentKind = "invoice" | "quote" | "credit_note" | "purchase_order" | "debit_note" | "sales_receipt";

// Generic document shape covering every doc type. The invoice-specific
// generateInvoiceHtml keeps its own field names and delegates here.
export interface DocumentData {
  documentNumber: string;
  issueDate: string;
  // Second date (due / expiry / delivery). Optional for types without one.
  secondDate?: string | null;
  contactName: string;
  contactEmail?: string | null;
  contactAddress?: string | null;
  contactTaxNumber?: string | null;
  lines: LineItem[];
  subtotal: number;
  taxTotal: number;
  total: number;
  amountPaid?: number;
  amountDue?: number;
  currencyCode: string;
  reference?: string | null;
  notes?: string | null;
}

export function generateDocumentHtml(
  kind: DocumentKind,
  doc: DocumentData,
  org: OrgInfo,
  template: TemplateSettings
): string {
  const cfg = DOC_CONFIGS[kind];
  const accent = safeAccentColor(template.accentColor);
  const hideTerms = !!cfg.hasPaymentTerms && template.showPaymentTerms === false;
  const taxIdLabel = getTaxIdLabel(org.countryCode);
  // Only invoices localize the heading ("Tax Invoice"); others use the fixed title.
  const docTitle = kind === "invoice" ? getInvoiceTitle(org.countryCode, !!org.taxId) : cfg.title;
  const amountPaid = doc.amountPaid ?? 0;
  const amountDue = doc.amountDue ?? doc.total;

  const templateVars: Record<string, string> = {
    orgName: org.name,
    orgAddress: org.address || "",
    orgTaxId: org.taxId || "",
    orgPhone: org.phone || "",
    orgEmail: org.email || "",
    orgRegistrationNumber: org.registrationNumber || "",
    invoiceNumber: doc.documentNumber,
    documentNumber: doc.documentNumber,
    issueDate: doc.issueDate,
    dueDate: doc.secondDate || "",
    contactName: doc.contactName,
    contactEmail: doc.contactEmail || "",
    contactAddress: doc.contactAddress || "",
    contactTaxNumber: doc.contactTaxNumber || "",
    reference: doc.reference || "",
    subtotal: formatMoney(doc.subtotal, doc.currencyCode),
    taxTotal: formatMoney(doc.taxTotal, doc.currencyCode),
    total: formatMoney(doc.total, doc.currencyCode),
    currency: doc.currencyCode,
  };

  // Header/footer are printed as plain text (tags removed) to match the PDF and
  // so nothing from the template is ever injected as markup.
  const headerText = templateBlockText(template.headerHtml, templateVars);
  const footerText = templateBlockText(template.footerHtml, templateVars);
  const headerHtml = logoHtml(template.logoUrl) + (headerText
    ? `<p style="font-size:12px;color:#6b7280;margin:0 0 20px;white-space:pre-wrap;">${escapeHtml(headerText)}</p>`
    : "");
  const footerHtml = footerText
    ? `<p style="margin-top:24px;font-size:11px;color:#6b7280;white-space:pre-wrap;">${escapeHtml(footerText)}</p>`
    : "";
  const termsText = cfg.hasPaymentTerms && !hideTerms ? paymentTermsText(doc.issueDate, doc.secondDate) : null;
  const paymentTermsSection = termsText
    ? `<div style="margin-top:24px;">
        <p style="font-size:12px;font-weight:600;color:#111827;margin:0 0 4px;">Payment terms</p>
        <p style="font-size:12px;color:#6b7280;margin:0;">${escapeHtml(termsText)}</p>
      </div>`
    : "";

  const linesHtml = doc.lines
    .map(
      (line) => `
    <tr>
      <td style="padding:6px 0;font-size:13px;">${escapeHtml(line.description)}</td>
      <td style="padding:6px 0;text-align:right;font-size:13px;">${(line.quantity / 100).toFixed(2)}</td>
      <td style="padding:6px 0;text-align:right;font-size:13px;">${formatMoney(line.unitPrice, doc.currencyCode)}</td>
      <td style="padding:6px 0;text-align:right;font-size:13px;">${formatMoney(line.amount, doc.currencyCode)}</td>
    </tr>`
    )
    .join("");

  const taxRow =
    template.showTaxBreakdown !== false && doc.taxTotal > 0
      ? `<tr>
          <td colspan="3" style="text-align:right;padding:3px 6px 3px 0;color:#6b7280;font-size:12px;border-top:0.5px solid #e5e7eb;">Tax</td>
          <td style="text-align:right;padding:3px 0;font-size:12px;border-top:0.5px solid #e5e7eb;">${formatMoney(doc.taxTotal, doc.currencyCode)}</td>
        </tr>`
      : "";

  const paidRow = cfg.showAmountDue && amountPaid > 0
    ? `<tr>
        <td colspan="3" style="text-align:right;padding:3px 6px 3px 0;color:#6b7280;font-size:12px;border-top:0.5px solid #e5e7eb;">Amount paid</td>
        <td style="text-align:right;padding:3px 0;font-size:12px;border-top:0.5px solid #e5e7eb;">${formatMoney(amountPaid, doc.currencyCode)}</td>
      </tr>`
    : "";

  const amountDueRow = cfg.showAmountDue || cfg.totalLabel
    ? `<tr>
        <td colspan="3" style="text-align:right;padding:3px 6px 3px 0;font-weight:600;font-size:12px;border-top:0.5px solid #e5e7eb;">${cfg.showAmountDue ? "Amount due" : cfg.totalLabel}</td>
        <td style="text-align:right;padding:3px 0;font-weight:600;font-size:12px;border-top:0.5px solid #e5e7eb;">${formatMoney(cfg.showAmountDue ? amountDue : doc.total, doc.currencyCode)}</td>
      </tr>`
    : "";

  const bankDetailsText = template.bankDetails
    ? replaceTemplatePlaceholders(template.bankDetails, templateVars)
    : "";
  const bankDetailsSection = bankDetailsText
    ? `<div style="margin-top:24px;">
        <p style="font-size:12px;font-weight:600;color:#111827;margin:0 0 4px;">Bank details</p>
        <p style="font-size:12px;color:#6b7280;margin:0;white-space:pre-wrap;">${escapeHtml(bankDetailsText)}</p>
      </div>`
    : "";

  const paymentInstructionsText = template.paymentInstructions
    ? replaceTemplatePlaceholders(template.paymentInstructions, templateVars)
    : "";
  const paymentInstructionsSection = paymentInstructionsText
    ? `<div style="margin-top:16px;">
        <p style="font-size:12px;font-weight:600;color:#111827;margin:0 0 4px;">Payment instructions</p>
        <p style="font-size:12px;color:#6b7280;margin:0;white-space:pre-wrap;">${escapeHtml(paymentInstructionsText)}</p>
      </div>`
    : "";

  const notesText = template.notes || doc.notes
    ? replaceTemplatePlaceholders(template.notes || doc.notes || "", templateVars)
    : "";
  const notesSection = notesText
    ? `<div style="margin-top:16px;font-size:12px;color:#6b7280;">${escapeHtml(notesText)}</div>`
    : "";

  const secondDateRow = cfg.secondDateLabel && doc.secondDate && !hideTerms
    ? `<tr>
      <td style="padding:2px 12px 2px 0;color:#6b7280;">${cfg.secondDateLabel}</td>
      <td style="padding:2px 0;">${doc.secondDate}</td>
    </tr>`
    : "";

  const summaryText = cfg.showAmountDue
    ? hideTerms
      ? formatMoney(amountDue, doc.currencyCode)
      : `${formatMoney(amountDue, doc.currencyCode)} due ${doc.secondDate || doc.issueDate}`
    : cfg.summaryNoun
      ? `${formatMoney(doc.total, doc.currencyCode)} ${cfg.summaryNoun} ${doc.issueDate}`
      : formatMoney(doc.total, doc.currencyCode);
  const dueSummary = `<p style="font-size:18px;font-weight:600;margin:0 0 24px;">${summaryText}</p>`;

  const footerSummary = `${escapeHtml(doc.documentNumber)} · ${summaryText}`;

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>${docTitle} ${doc.documentNumber}</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Inter',sans-serif;margin:0;padding:0;color:#111827;max-width:800px;">
  <!-- Accent bar -->
  <div style="height:4px;background:${accent};"></div>

  <div style="padding:32px 40px 40px;">
  ${headerHtml}

  <!-- Title -->
  <h1 style="margin:0 0 24px;font-size:22px;font-weight:600;letter-spacing:-0.3px;">${docTitle}</h1>

  <!-- Metadata -->
  <table style="font-size:12px;border-collapse:collapse;margin-bottom:24px;">
    <tr>
      <td style="padding:2px 12px 2px 0;font-weight:600;">${cfg.numberLabel}</td>
      <td style="padding:2px 0;font-weight:600;">${doc.documentNumber}</td>
    </tr>
    <tr>
      <td style="padding:2px 12px 2px 0;color:#6b7280;">Date of issue</td>
      <td style="padding:2px 0;">${doc.issueDate}</td>
    </tr>
    ${secondDateRow}
    ${doc.reference ? `<tr>
      <td style="padding:2px 12px 2px 0;color:#6b7280;">Reference</td>
      <td style="padding:2px 0;">${escapeHtml(doc.reference)}</td>
    </tr>` : ""}
  </table>

  <!-- Parties -->
  <div style="display:flex;gap:40px;margin-bottom:24px;">
    <div style="width:200px;">
      <p style="font-size:13px;font-weight:600;margin:0 0 3px;">${escapeHtml(org.name)}</p>
      ${org.address ? `<p style="font-size:12px;color:#6b7280;margin:0 0 1px;">${escapeHtml(org.address)}</p>` : ""}
      ${org.email ? `<p style="font-size:12px;color:#6b7280;margin:0 0 1px;">${escapeHtml(org.email)}</p>` : ""}
      ${org.phone ? `<p style="font-size:12px;color:#6b7280;margin:0 0 1px;">${escapeHtml(org.phone)}</p>` : ""}
      ${org.taxId ? `<p style="font-size:12px;color:#6b7280;margin:0 0 1px;">${taxIdLabel}: ${escapeHtml(org.taxId)}</p>` : ""}
      ${org.registrationNumber ? `<p style="font-size:12px;color:#6b7280;margin:0;">Reg: ${escapeHtml(org.registrationNumber)}</p>` : ""}
    </div>
    <div style="width:200px;">
      <p style="font-size:13px;font-weight:600;margin:0 0 3px;">${cfg.partyLabel}</p>
      <p style="font-size:12px;color:#6b7280;margin:0 0 1px;">${escapeHtml(doc.contactName)}</p>
      ${doc.contactAddress ? `<p style="font-size:12px;color:#6b7280;margin:0 0 1px;">${escapeHtml(doc.contactAddress)}</p>` : ""}
      ${doc.contactEmail ? `<p style="font-size:12px;color:#6b7280;margin:0 0 1px;">${escapeHtml(doc.contactEmail)}</p>` : ""}
      ${doc.contactTaxNumber ? `<p style="font-size:12px;color:#6b7280;margin:0;">${taxIdLabel}: ${escapeHtml(doc.contactTaxNumber)}</p>` : ""}
    </div>
  </div>

  <!-- Summary headline -->
  ${dueSummary}

  <!-- Line Items -->
  <table style="width:100%;border-collapse:collapse;">
    <thead>
      <tr>
        <th style="padding:6px 0;text-align:left;border-bottom:1px solid #111827;font-size:11px;font-weight:400;color:#6b7280;">Description</th>
        <th style="padding:6px 0;text-align:right;border-bottom:1px solid #111827;font-size:11px;font-weight:400;color:#6b7280;">Qty</th>
        <th style="padding:6px 0;text-align:right;border-bottom:1px solid #111827;font-size:11px;font-weight:400;color:#6b7280;">Unit price</th>
        <th style="padding:6px 0;text-align:right;border-bottom:1px solid #111827;font-size:11px;font-weight:400;color:#6b7280;">Amount</th>
      </tr>
    </thead>
    <tbody>${linesHtml}</tbody>
    <tfoot>
      <tr>
        <td colspan="3" style="text-align:right;padding:3px 6px 3px 0;color:#6b7280;font-size:12px;border-top:0.5px solid #e5e7eb;">Subtotal</td>
        <td style="text-align:right;padding:3px 0;font-size:12px;border-top:0.5px solid #e5e7eb;">${formatMoney(doc.subtotal, doc.currencyCode)}</td>
      </tr>
      ${taxRow}
      <tr>
        <td colspan="3" style="text-align:right;padding:3px 6px 3px 0;color:#6b7280;font-size:12px;border-top:0.5px solid #e5e7eb;">Total</td>
        <td style="text-align:right;padding:3px 0;font-size:12px;border-top:0.5px solid #e5e7eb;">${formatMoney(doc.total, doc.currencyCode)}</td>
      </tr>
      ${paidRow}
      ${amountDueRow}
    </tfoot>
  </table>

  ${paymentTermsSection}
  ${bankDetailsSection}
  ${paymentInstructionsSection}
  ${notesSection}
  ${footerHtml}

  <!-- Footer -->
  <div style="margin-top:40px;padding-top:8px;border-top:0.5px solid #e5e7eb;display:flex;justify-content:space-between;align-items:center;">
    <span style="font-size:10px;color:#6b7280;">${footerSummary}</span>
    <a href="https://dubbl.dev" style="text-decoration:none;display:inline-flex;align-items:center;gap:4px;">
      <svg viewBox="0 0 40 32" fill="none" xmlns="http://www.w3.org/2000/svg" width="12" height="9">
        <path d="M18 4v.19a11.5 11.5 0 0 1 5.5 9.81v4a11.5 11.5 0 0 1-5.5 9.81V28h8a10 10 0 0 0 10-10v-4A10 10 0 0 0 26 4h-8z" fill="#c4c4c0"/>
        <path d="M4 4h8a10 10 0 0 1 10 10v4a10 10 0 0 1-10 10H4V4z" fill="#c4c4c0"/>
      </svg>
      <span style="font-size:9px;color:#d1d5db;letter-spacing:0.5px;">dubbl</span>
    </a>
  </div>
  </div>
</body>
</html>`;
}

export function generateQuoteHtml(doc: DocumentData, org: OrgInfo, template: TemplateSettings): string {
  return generateDocumentHtml("quote", doc, org, template);
}

export function generateCreditNoteHtml(doc: DocumentData, org: OrgInfo, template: TemplateSettings): string {
  return generateDocumentHtml("credit_note", doc, org, template);
}

export function generatePurchaseOrderHtml(doc: DocumentData, org: OrgInfo, template: TemplateSettings): string {
  return generateDocumentHtml("purchase_order", doc, org, template);
}

export function generateDebitNoteHtml(doc: DocumentData, org: OrgInfo, template: TemplateSettings): string {
  return generateDocumentHtml("debit_note", doc, org, template);
}

export function generateSalesReceiptHtml(doc: DocumentData, org: OrgInfo, template: TemplateSettings): string {
  return generateDocumentHtml("sales_receipt", doc, org, template);
}

// The template's logo as an <img>, limited to http(s) and PNG/JPEG data URLs.
function logoHtml(url: string | null | undefined): string {
  if (!url) return "";
  const src = url.trim();
  const ok = /^https?:\/\//i.test(src) || /^data:image\/(png|jpe?g);base64,[a-z0-9+/=\s]+$/i.test(src);
  if (!ok) return "";
  return `<img src="${escapeHtml(src)}" alt="" style="display:block;max-height:64px;max-width:200px;object-fit:contain;margin:0 0 18px;" />`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}


export function generateInvoiceHtml(
  invoice: InvoiceData,
  org: OrgInfo,
  template: TemplateSettings
): string {
  return generateDocumentHtml(
    "invoice",
    {
      documentNumber: invoice.invoiceNumber,
      issueDate: invoice.issueDate,
      secondDate: invoice.dueDate,
      contactName: invoice.contactName,
      contactEmail: invoice.contactEmail,
      contactAddress: invoice.contactAddress,
      contactTaxNumber: invoice.contactTaxNumber,
      lines: invoice.lines,
      subtotal: invoice.subtotal,
      taxTotal: invoice.taxTotal,
      total: invoice.total,
      amountPaid: invoice.amountPaid,
      amountDue: invoice.amountDue,
      currencyCode: invoice.currencyCode,
      reference: invoice.reference,
      notes: invoice.notes,
    },
    org,
    template
  );
}

export interface PayslipHtmlData {
  employeeName: string;
  employeeNumber?: string | null;
  position?: string | null;
  department?: string | null;
  employeeEmail?: string | null;
  payPeriodStart: string;
  payPeriodEnd: string;
  payDate?: string | null;
  currencyCode: string;
  earnings: { description: string; amount: number }[];
  grossAmount: number;
  taxAmount: number;
  taxLines?: { description: string; amount: number }[];
  deductions: { description: string; amount: number }[];
  netAmount: number;
  ytdGross: number;
  ytdTax: number;
  ytdNet: number;
}

/** HTML version of the payslip PDF, used for the template preview. */
export function generatePayslipHtml(slip: PayslipHtmlData, org: OrgInfo, template: TemplateSettings): string {
  const accent = safeAccentColor(template.accentColor);
  const cur = slip.currencyCode;
  const period = `${slip.payPeriodStart} to ${slip.payPeriodEnd}`;
  const totalDeductions = slip.grossAmount - slip.netAmount;
  const taxLines =
    template.showTaxBreakdown !== false && slip.taxLines && slip.taxLines.length > 0
      ? slip.taxLines
      : [{ description: "Tax withheld", amount: slip.taxAmount }];

  const vars: Record<string, string> = {
    orgName: org.name,
    orgAddress: org.address || "",
    orgTaxId: org.taxId || "",
    orgPhone: org.phone || "",
    orgEmail: org.email || "",
    orgRegistrationNumber: org.registrationNumber || "",
    employeeName: slip.employeeName,
    employeeNumber: slip.employeeNumber || "",
    payPeriodStart: slip.payPeriodStart,
    payPeriodEnd: slip.payPeriodEnd,
    payDate: slip.payDate || "",
    issueDate: slip.payDate || slip.payPeriodEnd,
    grossPay: formatMoney(slip.grossAmount, cur),
    netPay: formatMoney(slip.netAmount, cur),
    total: formatMoney(slip.netAmount, cur),
    currency: cur,
  };

  const headerText = templateBlockText(template.headerHtml, vars);
  const footerText = templateBlockText(template.footerHtml, vars);
  const block = (title: string, text: string | null) =>
    text
      ? `<div style="margin-top:16px;">
        ${title ? `<p style="font-size:12px;font-weight:600;color:#111827;margin:0 0 4px;">${title}</p>` : ""}
        <p style="font-size:12px;color:#6b7280;margin:0;white-space:pre-wrap;">${escapeHtml(text)}</p>
      </div>`
      : "";
  const row = (label: string, amount: number, bold = false) => `<tr>
      <td style="padding:4px 0;font-size:12px;border-top:0.5px solid #e5e7eb;${bold ? "font-weight:600;" : ""}">${escapeHtml(label)}</td>
      <td style="padding:4px 0;font-size:12px;text-align:right;border-top:0.5px solid #e5e7eb;${bold ? "font-weight:600;" : ""}">${formatMoney(amount, cur)}</td>
    </tr>`;
  const section = (title: string, rows: string) => `
  <p style="font-size:13px;font-weight:600;margin:20px 0 4px;">${title}</p>
  <table style="width:100%;border-collapse:collapse;">${rows}</table>`;

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Payslip ${escapeHtml(slip.employeeName)}</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Inter',sans-serif;margin:0;padding:0;color:#111827;max-width:800px;">
  <div style="height:4px;background:${accent};"></div>
  <div style="padding:32px 40px 40px;">
  ${logoHtml(template.logoUrl)}
  ${headerText ? `<p style="font-size:12px;color:#6b7280;margin:0 0 20px;white-space:pre-wrap;">${escapeHtml(headerText)}</p>` : ""}
  <h1 style="margin:0 0 24px;font-size:22px;font-weight:600;letter-spacing:-0.3px;">Payslip</h1>

  <table style="font-size:12px;border-collapse:collapse;margin-bottom:24px;">
    <tr><td style="padding:2px 12px 2px 0;font-weight:600;">Pay period</td><td style="padding:2px 0;font-weight:600;">${period}</td></tr>
    ${slip.payDate ? `<tr><td style="padding:2px 12px 2px 0;color:#6b7280;">Pay date</td><td style="padding:2px 0;">${slip.payDate}</td></tr>` : ""}
    ${slip.employeeNumber ? `<tr><td style="padding:2px 12px 2px 0;color:#6b7280;">Employee no.</td><td style="padding:2px 0;">${escapeHtml(slip.employeeNumber)}</td></tr>` : ""}
  </table>

  <div style="display:flex;gap:40px;margin-bottom:24px;">
    <div style="width:200px;">
      <p style="font-size:13px;font-weight:600;margin:0 0 3px;">${escapeHtml(org.name)}</p>
      ${org.address ? `<p style="font-size:12px;color:#6b7280;margin:0 0 1px;">${escapeHtml(org.address)}</p>` : ""}
      ${org.email ? `<p style="font-size:12px;color:#6b7280;margin:0 0 1px;">${escapeHtml(org.email)}</p>` : ""}
      ${org.phone ? `<p style="font-size:12px;color:#6b7280;margin:0 0 1px;">${escapeHtml(org.phone)}</p>` : ""}
    </div>
    <div style="width:200px;">
      <p style="font-size:13px;font-weight:600;margin:0 0 3px;">Employee</p>
      <p style="font-size:12px;color:#6b7280;margin:0 0 1px;">${escapeHtml(slip.employeeName)}</p>
      ${slip.position ? `<p style="font-size:12px;color:#6b7280;margin:0 0 1px;">${escapeHtml(slip.position)}</p>` : ""}
      ${slip.department ? `<p style="font-size:12px;color:#6b7280;margin:0 0 1px;">${escapeHtml(slip.department)}</p>` : ""}
      ${slip.employeeEmail ? `<p style="font-size:12px;color:#6b7280;margin:0;">${escapeHtml(slip.employeeEmail)}</p>` : ""}
    </div>
  </div>

  <p style="font-size:18px;font-weight:600;margin:0 0 8px;">${formatMoney(slip.netAmount, cur)} take-home pay</p>

  ${section("Earnings", slip.earnings.map((l) => row(l.description, l.amount)).join("") + row("Gross pay", slip.grossAmount, true))}
  ${section("Taxes and deductions", [...taxLines, ...slip.deductions].map((l) => row(l.description, l.amount)).join("") + row("Total deductions", totalDeductions, true))}
  <table style="width:100%;border-collapse:collapse;margin-top:14px;">${row("Net pay", slip.netAmount, true)}</table>
  ${section("Year to date", row("Gross pay", slip.ytdGross) + row("Tax", slip.ytdTax) + row("Net pay", slip.ytdNet))}

  ${block("Bank details", template.bankDetails ? replaceTemplatePlaceholders(template.bankDetails, vars) : null)}
  ${block("Payment instructions", template.paymentInstructions ? replaceTemplatePlaceholders(template.paymentInstructions, vars) : null)}
  ${block("", template.notes ? replaceTemplatePlaceholders(template.notes, vars) : null)}
  ${footerText ? `<p style="margin-top:24px;font-size:11px;color:#6b7280;white-space:pre-wrap;">${escapeHtml(footerText)}</p>` : ""}

  <div style="margin-top:40px;padding-top:8px;border-top:0.5px solid #e5e7eb;">
    <span style="font-size:10px;color:#6b7280;">${escapeHtml(slip.employeeName)} · Pay period ${period}</span>
  </div>
  </div>
</body>
</html>`;
}
