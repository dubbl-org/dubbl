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
  if ((cc === "AU" || cc === "NZ") && hasTaxId) return "Tax Invoice";
  return "Invoice";
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
      (line) => `
    <tr>
      <td style="padding:6px 0;font-size:13px;">${escapeHtml(line.description)}</td>
      <td style="padding:6px 0;text-align:right;font-size:13px;">${(line.quantity / 100).toFixed(2)}</td>
      <td style="padding:6px 0;text-align:right;font-size:13px;">${formatMoney(line.unitPrice, invoice.currencyCode)}</td>
      <td style="padding:6px 0;text-align:right;font-size:13px;">${formatMoney(line.amount, invoice.currencyCode)}</td>
    </tr>`
    )
    .join("");

  const taxRow =
    template.showTaxBreakdown !== false && invoice.taxTotal > 0
      ? `<tr>
          <td colspan="3" style="text-align:right;padding:3px 6px 3px 0;color:#6b7280;font-size:12px;border-top:0.5px solid #e5e7eb;">Tax</td>
          <td style="text-align:right;padding:3px 0;font-size:12px;border-top:0.5px solid #e5e7eb;">${formatMoney(invoice.taxTotal, invoice.currencyCode)}</td>
        </tr>`
      : "";

  const paidRow = amountPaid > 0
    ? `<tr>
        <td colspan="3" style="text-align:right;padding:3px 6px 3px 0;color:#6b7280;font-size:12px;border-top:0.5px solid #e5e7eb;">Amount paid</td>
        <td style="text-align:right;padding:3px 0;font-size:12px;border-top:0.5px solid #e5e7eb;">${formatMoney(amountPaid, invoice.currencyCode)}</td>
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

  const notesText = template.notes || invoice.notes
    ? replaceTemplatePlaceholders(template.notes || invoice.notes || "", templateVars)
    : "";
  const notesSection = notesText
    ? `<div style="margin-top:16px;font-size:12px;color:#6b7280;">${escapeHtml(notesText)}</div>`
    : "";

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Invoice ${invoice.invoiceNumber}</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Inter',sans-serif;margin:0;padding:0;color:#111827;max-width:800px;">
  <!-- Accent bar -->
  <div style="height:4px;background:${accent};"></div>

  <div style="padding:32px 40px 40px;">
  ${headerHtml}

  <!-- Title -->
  <h1 style="margin:0 0 24px;font-size:22px;font-weight:600;letter-spacing:-0.3px;">${invoiceTitle}</h1>

  <!-- Metadata -->
  <table style="font-size:12px;border-collapse:collapse;margin-bottom:24px;">
    <tr>
      <td style="padding:2px 12px 2px 0;font-weight:600;">Invoice number</td>
      <td style="padding:2px 0;font-weight:600;">${invoice.invoiceNumber}</td>
    </tr>
    <tr>
      <td style="padding:2px 12px 2px 0;color:#6b7280;">Date of issue</td>
      <td style="padding:2px 0;">${invoice.issueDate}</td>
    </tr>
    <tr>
      <td style="padding:2px 12px 2px 0;color:#6b7280;">Date due</td>
      <td style="padding:2px 0;">${invoice.dueDate}</td>
    </tr>
    ${invoice.reference ? `<tr>
      <td style="padding:2px 12px 2px 0;color:#6b7280;">Reference</td>
      <td style="padding:2px 0;">${escapeHtml(invoice.reference)}</td>
    </tr>` : ""}
  </table>

  <!-- Seller / Buyer -->
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
      <p style="font-size:13px;font-weight:600;margin:0 0 3px;">Bill to</p>
      <p style="font-size:12px;color:#6b7280;margin:0 0 1px;">${escapeHtml(invoice.contactName)}</p>
      ${invoice.contactAddress ? `<p style="font-size:12px;color:#6b7280;margin:0 0 1px;">${escapeHtml(invoice.contactAddress)}</p>` : ""}
      ${invoice.contactEmail ? `<p style="font-size:12px;color:#6b7280;margin:0 0 1px;">${escapeHtml(invoice.contactEmail)}</p>` : ""}
      ${invoice.contactTaxNumber ? `<p style="font-size:12px;color:#6b7280;margin:0;">${taxIdLabel}: ${escapeHtml(invoice.contactTaxNumber)}</p>` : ""}
    </div>
  </div>

  <!-- Due amount summary -->
  <p style="font-size:18px;font-weight:600;margin:0 0 24px;">${formatMoney(amountDue, invoice.currencyCode)} due ${invoice.dueDate}</p>

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
        <td style="text-align:right;padding:3px 0;font-size:12px;border-top:0.5px solid #e5e7eb;">${formatMoney(invoice.subtotal, invoice.currencyCode)}</td>
      </tr>
      ${taxRow}
      <tr>
        <td colspan="3" style="text-align:right;padding:3px 6px 3px 0;color:#6b7280;font-size:12px;border-top:0.5px solid #e5e7eb;">Total</td>
        <td style="text-align:right;padding:3px 0;font-size:12px;border-top:0.5px solid #e5e7eb;">${formatMoney(invoice.total, invoice.currencyCode)}</td>
      </tr>
      ${paidRow}
      <tr>
        <td colspan="3" style="text-align:right;padding:3px 6px 3px 0;font-weight:600;font-size:12px;border-top:0.5px solid #e5e7eb;">Amount due</td>
        <td style="text-align:right;padding:3px 0;font-weight:600;font-size:12px;border-top:0.5px solid #e5e7eb;">${formatMoney(amountDue, invoice.currencyCode)}</td>
      </tr>
    </tfoot>
  </table>

  ${bankDetailsSection}
  ${paymentInstructionsSection}
  ${notesSection}
  ${footerHtml}

  <!-- Footer -->
  <div style="margin-top:40px;padding-top:8px;border-top:0.5px solid #e5e7eb;display:flex;justify-content:space-between;align-items:center;">
    <span style="font-size:10px;color:#6b7280;">${invoice.invoiceNumber} · ${formatMoney(amountDue, invoice.currencyCode)} due ${invoice.dueDate}</span>
    <a href="https://dubbl.dev" style="text-decoration:none;display:inline-flex;align-items:center;gap:4px;">
      <svg viewBox="0 0 40 32" fill="none" xmlns="http://www.w3.org/2000/svg" width="12" height="9">
        <path d="M18 4h8a10 10 0 0 1 10 10v4a10 10 0 0 1-10 10h-8V4z" fill="#d1d5db"/>
        <path d="M4 4h8a10 10 0 0 1 10 10v4a10 10 0 0 1-10 10H4V4z" fill="#9ca3af"/>
      </svg>
      <span style="font-size:9px;color:#d1d5db;letter-spacing:0.5px;">dubbl</span>
    </a>
  </div>
  </div>
</body>
</html>`;
}
