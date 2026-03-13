import { formatMoney } from "@/lib/money";

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
  if ((cc === "AU" || cc === "NZ") && hasTaxId) return "TAX INVOICE";
  return "INVOICE";
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function replaceTemplatePlaceholders(
  text: string,
  vars: Record<string, string>
): string {
  return text.replace(/\{\{(\w+)\}\}/g, (match, key) => vars[key] ?? match);
}

export function generateInvoiceHtml(
  invoice: InvoiceData,
  org: OrgInfo,
  template: TemplateSettings
): string {
  const accent = template.accentColor || "#10b981";
  const taxIdLabel = getTaxIdLabel(org.countryCode);
  const invoiceTitle = getInvoiceTitle(org.countryCode, !!org.taxId);
  const amountPaid = invoice.amountPaid ?? 0;
  const amountDue = invoice.amountDue ?? invoice.total;

  const templateVars: Record<string, string> = {
    orgName: org.name,
    orgAddress: org.address || "",
    orgTaxId: org.taxId || "",
    orgPhone: org.phone || "",
    orgEmail: org.email || "",
    orgRegistrationNumber: org.registrationNumber || "",
    invoiceNumber: invoice.invoiceNumber,
    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate,
    contactName: invoice.contactName,
    contactEmail: invoice.contactEmail || "",
    contactAddress: invoice.contactAddress || "",
    contactTaxNumber: invoice.contactTaxNumber || "",
    reference: invoice.reference || "",
    subtotal: formatMoney(invoice.subtotal, invoice.currencyCode),
    taxTotal: formatMoney(invoice.taxTotal, invoice.currencyCode),
    total: formatMoney(invoice.total, invoice.currencyCode),
    currency: invoice.currencyCode,
  };

  const headerHtml = template.headerHtml
    ? replaceTemplatePlaceholders(template.headerHtml, templateVars)
    : "";
  const footerHtml = template.footerHtml
    ? replaceTemplatePlaceholders(template.footerHtml, templateVars)
    : "";

  const linesHtml = invoice.lines
    .map(
      (line, i) => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#6b7280;width:30px;">${i + 1}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${escapeHtml(line.description)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;">${(line.quantity / 100).toFixed(2)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;">${formatMoney(line.unitPrice, invoice.currencyCode)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;">${formatMoney(line.amount, invoice.currencyCode)}</td>
    </tr>`
    )
    .join("");

  const taxRow =
    template.showTaxBreakdown !== false && invoice.taxTotal > 0
      ? `<tr><td colspan="4" style="text-align:right;padding:4px 12px;color:#6b7280;">Tax</td><td style="text-align:right;padding:4px 12px;">${formatMoney(invoice.taxTotal, invoice.currencyCode)}</td></tr>`
      : "";

  const paidRow = amountPaid > 0
    ? `<tr><td colspan="4" style="text-align:right;padding:4px 12px;color:#6b7280;">Amount Paid</td><td style="text-align:right;padding:4px 12px;color:#059669;">${formatMoney(amountPaid, invoice.currencyCode)}</td></tr>`
    : "";

  const bankDetailsText = template.bankDetails
    ? replaceTemplatePlaceholders(template.bankDetails, templateVars)
    : "";
  const bankDetailsSection = bankDetailsText
    ? `<div style="margin-top:24px;padding:12px;background:#f9fafb;border-radius:4px;">
        <p style="font-size:11px;font-weight:600;color:#374151;margin:0 0 4px;">Bank Details</p>
        <p style="font-size:12px;color:#6b7280;margin:0;white-space:pre-wrap;">${escapeHtml(bankDetailsText)}</p>
      </div>`
    : "";

  const paymentInstructionsText = template.paymentInstructions
    ? replaceTemplatePlaceholders(template.paymentInstructions, templateVars)
    : "";
  const paymentInstructionsSection = paymentInstructionsText
    ? `<div style="margin-top:12px;padding:12px;background:#f9fafb;border-radius:4px;">
        <p style="font-size:11px;font-weight:600;color:#374151;margin:0 0 4px;">Payment Instructions</p>
        <p style="font-size:12px;color:#6b7280;margin:0;white-space:pre-wrap;">${escapeHtml(paymentInstructionsText)}</p>
      </div>`
    : "";

  const notesText = template.notes || invoice.notes
    ? replaceTemplatePlaceholders(template.notes || invoice.notes || "", templateVars)
    : "";
  const notesSection = notesText
    ? `<div style="margin-top:12px;padding:12px;background:#f9fafb;border-radius:4px;font-size:12px;color:#6b7280;">${escapeHtml(notesText)}</div>`
    : "";

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Invoice ${invoice.invoiceNumber}</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;margin:0;padding:40px;color:#111827;max-width:800px;">
  ${headerHtml}

  <!-- Header: Logo + Invoice title -->
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px;">
    <div>
      ${template.logoUrl ? `<img src="${template.logoUrl}" alt="Logo" style="max-height:48px;margin-bottom:8px;" />` : ""}
      <h1 style="margin:0;font-size:28px;color:${accent};letter-spacing:-0.5px;">${invoiceTitle}</h1>
      <p style="margin:6px 0 0;font-size:13px;color:#6b7280;">${invoice.invoiceNumber}</p>
    </div>
    <div style="text-align:right;">
      <table style="margin-left:auto;font-size:12px;border-collapse:collapse;">
        <tr><td style="padding:2px 8px;color:#6b7280;text-align:right;">Issue Date</td><td style="padding:2px 0;font-weight:500;">${invoice.issueDate}</td></tr>
        <tr><td style="padding:2px 8px;color:#6b7280;text-align:right;">Due Date</td><td style="padding:2px 0;font-weight:500;">${invoice.dueDate}</td></tr>
        ${invoice.reference ? `<tr><td style="padding:2px 8px;color:#6b7280;text-align:right;">Reference</td><td style="padding:2px 0;font-weight:500;">${escapeHtml(invoice.reference)}</td></tr>` : ""}
      </table>
    </div>
  </div>

  <!-- From / Bill To -->
  <div style="display:flex;gap:40px;margin-bottom:28px;">
    <div style="flex:1;">
      <p style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:1px;color:#9ca3af;margin:0 0 6px;">From</p>
      <p style="font-size:14px;font-weight:600;margin:0;">${escapeHtml(org.name)}</p>
      ${org.address ? `<p style="font-size:12px;color:#6b7280;margin:3px 0 0;">${escapeHtml(org.address)}</p>` : ""}
      ${org.phone ? `<p style="font-size:12px;color:#6b7280;margin:2px 0 0;">${escapeHtml(org.phone)}</p>` : ""}
      ${org.email ? `<p style="font-size:12px;color:#6b7280;margin:2px 0 0;">${escapeHtml(org.email)}</p>` : ""}
      ${org.taxId ? `<p style="font-size:12px;color:#6b7280;margin:2px 0 0;">${taxIdLabel}: ${escapeHtml(org.taxId)}</p>` : ""}
      ${org.registrationNumber ? `<p style="font-size:12px;color:#6b7280;margin:2px 0 0;">Reg: ${escapeHtml(org.registrationNumber)}</p>` : ""}
    </div>
    <div style="flex:1;">
      <p style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:1px;color:#9ca3af;margin:0 0 6px;">Bill To</p>
      <p style="font-size:14px;font-weight:600;margin:0;">${escapeHtml(invoice.contactName)}</p>
      ${invoice.contactAddress ? `<p style="font-size:12px;color:#6b7280;margin:3px 0 0;">${escapeHtml(invoice.contactAddress)}</p>` : ""}
      ${invoice.contactEmail ? `<p style="font-size:12px;color:#6b7280;margin:2px 0 0;">${escapeHtml(invoice.contactEmail)}</p>` : ""}
      ${invoice.contactTaxNumber ? `<p style="font-size:12px;color:#6b7280;margin:2px 0 0;">Tax No: ${escapeHtml(invoice.contactTaxNumber)}</p>` : ""}
    </div>
  </div>

  <!-- Line Items -->
  <table style="width:100%;border-collapse:collapse;font-size:13px;">
    <thead>
      <tr style="background:${accent}10;">
        <th style="padding:8px 12px;text-align:left;border-bottom:2px solid ${accent};width:30px;color:#6b7280;">#</th>
        <th style="padding:8px 12px;text-align:left;border-bottom:2px solid ${accent};">Description</th>
        <th style="padding:8px 12px;text-align:right;border-bottom:2px solid ${accent};">Qty</th>
        <th style="padding:8px 12px;text-align:right;border-bottom:2px solid ${accent};">Unit Price</th>
        <th style="padding:8px 12px;text-align:right;border-bottom:2px solid ${accent};">Amount</th>
      </tr>
    </thead>
    <tbody>${linesHtml}</tbody>
    <tfoot>
      <tr><td colspan="4" style="text-align:right;padding:6px 12px;color:#6b7280;">Subtotal</td><td style="text-align:right;padding:6px 12px;">${formatMoney(invoice.subtotal, invoice.currencyCode)}</td></tr>
      ${taxRow}
      <tr style="font-weight:700;font-size:14px;">
        <td colspan="4" style="text-align:right;padding:8px 12px;border-top:2px solid ${accent};">Total</td>
        <td style="text-align:right;padding:8px 12px;border-top:2px solid ${accent};">${formatMoney(invoice.total, invoice.currencyCode)}</td>
      </tr>
      ${paidRow}
    </tfoot>
  </table>

  <!-- Amount Due highlight -->
  <div style="margin-top:16px;text-align:right;">
    <div style="display:inline-block;background:${accent}10;border:1px solid ${accent}30;border-radius:6px;padding:12px 20px;">
      <p style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#6b7280;margin:0 0 4px;">Amount Due</p>
      <p style="font-size:22px;font-weight:700;color:${accent};margin:0;">${formatMoney(amountDue, invoice.currencyCode)}</p>
    </div>
  </div>

  ${template.showPaymentTerms !== false ? `<p style="margin-top:16px;font-size:12px;color:#6b7280;">Payment due by ${invoice.dueDate}</p>` : ""}
  ${bankDetailsSection}
  ${paymentInstructionsSection}
  ${notesSection}
  ${footerHtml}
  <div style="margin-top:40px;padding-top:12px;border-top:1px solid #f3f4f6;text-align:center;">
    <a href="https://dubbl.dev" style="text-decoration:none;display:inline-flex;align-items:center;gap:4px;">
      <svg viewBox="0 0 40 32" fill="none" xmlns="http://www.w3.org/2000/svg" width="14" height="11">
        <path d="M18 4h8a10 10 0 0 1 10 10v4a10 10 0 0 1-10 10h-8V4z" fill="#d1d5db"/>
        <path d="M4 4h8a10 10 0 0 1 10 10v4a10 10 0 0 1-10 10H4V4z" fill="#9ca3af"/>
      </svg>
      <span style="font-size:9px;color:#d1d5db;letter-spacing:0.5px;">dubbl</span>
    </a>
  </div>
</body>
</html>`;
}
