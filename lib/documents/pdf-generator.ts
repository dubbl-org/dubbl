import { formatMoney } from "@/lib/money";

interface TemplateSettings {
  logoUrl?: string | null;
  accentColor?: string | null;
  headerHtml?: string | null;
  footerHtml?: string | null;
  showTaxBreakdown?: boolean;
  showPaymentTerms?: boolean;
  notes?: string | null;
}

interface OrgInfo {
  name: string;
  address?: string | null;
  taxId?: string | null;
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
  lines: LineItem[];
  subtotal: number;
  taxTotal: number;
  total: number;
  currencyCode: string;
  reference?: string | null;
  notes?: string | null;
}

export function generateInvoiceHtml(
  invoice: InvoiceData,
  org: OrgInfo,
  template: TemplateSettings
): string {
  const accent = template.accentColor || "#10b981";

  const linesHtml = invoice.lines
    .map(
      (line) => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${line.description}</td>
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

  const notesSection =
    template.notes || invoice.notes
      ? `<div style="margin-top:24px;padding:12px;background:#f9fafb;border-radius:4px;font-size:12px;color:#6b7280;">${template.notes || invoice.notes}</div>`
      : "";

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Invoice ${invoice.invoiceNumber}</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;margin:0;padding:40px;color:#111827;">
  ${template.headerHtml || ""}
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px;">
    <div>
      ${template.logoUrl ? `<img src="${template.logoUrl}" alt="Logo" style="max-height:48px;margin-bottom:8px;" />` : ""}
      <h2 style="margin:0;color:${accent};">${org.name}</h2>
      ${org.address ? `<p style="margin:4px 0 0;font-size:12px;color:#6b7280;">${org.address}</p>` : ""}
      ${org.taxId ? `<p style="margin:2px 0 0;font-size:12px;color:#6b7280;">Tax ID: ${org.taxId}</p>` : ""}
    </div>
    <div style="text-align:right;">
      <h1 style="margin:0;font-size:28px;color:${accent};">INVOICE</h1>
      <p style="margin:4px 0 0;font-size:14px;color:#6b7280;">${invoice.invoiceNumber}</p>
      <p style="margin:2px 0 0;font-size:12px;color:#6b7280;">Date: ${invoice.issueDate}</p>
    </div>
  </div>
  <div style="margin-bottom:24px;">
    <p style="font-size:12px;color:#6b7280;margin:0;">Bill To</p>
    <p style="font-size:14px;font-weight:600;margin:4px 0 0;">${invoice.contactName}</p>
    ${invoice.contactEmail ? `<p style="font-size:12px;color:#6b7280;margin:2px 0 0;">${invoice.contactEmail}</p>` : ""}
    ${invoice.reference ? `<p style="font-size:12px;color:#6b7280;margin:2px 0 0;">Ref: ${invoice.reference}</p>` : ""}
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
  ${notesSection}
  ${template.footerHtml || ""}
</body>
</html>`;
}
