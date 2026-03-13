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
      (line) => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${escapeHtml(line.description)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;">${(line.quantity / 100).toFixed(2)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;">${formatMoney(line.unitPrice, invoice.currencyCode)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;">${formatMoney(line.amount, invoice.currencyCode)}</td>
    </tr>`
    )
    .join("");

  const taxRow =
    template.showTaxBreakdown !== false
      ? `<tr><td colspan="3" style="text-align:right;padding:4px 12px;">Tax</td><td style="text-align:right;padding:4px 12px;">${formatMoney(invoice.taxTotal, invoice.currencyCode)}</td></tr>`
      : "";

  const termsSection =
    template.showPaymentTerms !== false
      ? `<p style="margin-top:16px;font-size:12px;color:#6b7280;">Due Date: ${invoice.dueDate}</p>`
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
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;margin:0;padding:40px;color:#111827;">
  ${headerHtml}
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px;">
    <div>
      ${template.logoUrl ? `<img src="${template.logoUrl}" alt="Logo" style="max-height:48px;margin-bottom:8px;" />` : ""}
      <h2 style="margin:0;color:${accent};">${escapeHtml(org.name)}</h2>
      ${org.address ? `<p style="margin:4px 0 0;font-size:12px;color:#6b7280;">${escapeHtml(org.address)}</p>` : ""}
      ${org.taxId ? `<p style="margin:2px 0 0;font-size:12px;color:#6b7280;">${taxIdLabel}: ${escapeHtml(org.taxId)}</p>` : ""}
      ${org.registrationNumber ? `<p style="margin:2px 0 0;font-size:12px;color:#6b7280;">Reg: ${escapeHtml(org.registrationNumber)}</p>` : ""}
      ${org.phone ? `<p style="margin:2px 0 0;font-size:12px;color:#6b7280;">Phone: ${escapeHtml(org.phone)}</p>` : ""}
      ${org.email ? `<p style="margin:2px 0 0;font-size:12px;color:#6b7280;">${escapeHtml(org.email)}</p>` : ""}
    </div>
    <div style="text-align:right;">
      <h1 style="margin:0;font-size:28px;color:${accent};">${invoiceTitle}</h1>
      <p style="margin:4px 0 0;font-size:14px;color:#6b7280;">${invoice.invoiceNumber}</p>
      <p style="margin:2px 0 0;font-size:12px;color:#6b7280;">Date: ${invoice.issueDate}</p>
    </div>
  </div>
  <div style="margin-bottom:24px;">
    <p style="font-size:12px;color:#6b7280;margin:0;">Bill To</p>
    <p style="font-size:14px;font-weight:600;margin:4px 0 0;">${escapeHtml(invoice.contactName)}</p>
    ${invoice.contactAddress ? `<p style="font-size:12px;color:#6b7280;margin:2px 0 0;">${escapeHtml(invoice.contactAddress)}</p>` : ""}
    ${invoice.contactTaxNumber ? `<p style="font-size:12px;color:#6b7280;margin:2px 0 0;">Tax No: ${escapeHtml(invoice.contactTaxNumber)}</p>` : ""}
    ${invoice.contactEmail ? `<p style="font-size:12px;color:#6b7280;margin:2px 0 0;">${escapeHtml(invoice.contactEmail)}</p>` : ""}
    ${invoice.reference ? `<p style="font-size:12px;color:#6b7280;margin:2px 0 0;">Ref: ${escapeHtml(invoice.reference)}</p>` : ""}
  </div>
  <table style="width:100%;border-collapse:collapse;font-size:13px;">
    <thead>
      <tr style="background:${accent}10;">
        <th style="padding:8px 12px;text-align:left;border-bottom:2px solid ${accent};">Description</th>
        <th style="padding:8px 12px;text-align:right;border-bottom:2px solid ${accent};">Qty</th>
        <th style="padding:8px 12px;text-align:right;border-bottom:2px solid ${accent};">Price</th>
        <th style="padding:8px 12px;text-align:right;border-bottom:2px solid ${accent};">Amount</th>
      </tr>
    </thead>
    <tbody>${linesHtml}</tbody>
    <tfoot>
      <tr><td colspan="3" style="text-align:right;padding:4px 12px;">Subtotal</td><td style="text-align:right;padding:4px 12px;">${formatMoney(invoice.subtotal, invoice.currencyCode)}</td></tr>
      ${taxRow}
      <tr style="font-weight:700;font-size:15px;">
        <td colspan="3" style="text-align:right;padding:8px 12px;border-top:2px solid ${accent};">Total</td>
        <td style="text-align:right;padding:8px 12px;border-top:2px solid ${accent};">${formatMoney(invoice.total, invoice.currencyCode)}</td>
      </tr>
    </tfoot>
  </table>
  ${termsSection}
  ${bankDetailsSection}
  ${paymentInstructionsSection}
  ${notesSection}
  ${footerHtml}
</body>
</html>`;
}
