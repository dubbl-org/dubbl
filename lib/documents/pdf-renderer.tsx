import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
  Svg,
  Path,
  Link,
} from "@react-pdf/renderer";

export interface OrgInfo {
  name: string;
  address?: string | null;
  taxId?: string | null;
  registrationNumber?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  countryCode?: string | null;
}

export interface ContactInfo {
  name: string;
  email?: string | null;
  address?: string | null;
  taxNumber?: string | null;
}

export interface PdfLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  taxAmount: number;
  amount: number;
}

export interface PdfInvoiceData {
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  lines: PdfLineItem[];
  subtotal: number;
  taxTotal: number;
  total: number;
  amountPaid?: number;
  amountDue?: number;
  currencyCode: string;
  reference?: string | null;
  notes?: string | null;
}

export interface PdfTemplateSettings {
  accentColor?: string | null;
  showTaxBreakdown?: boolean;
  showPaymentTerms?: boolean;
  notes?: string | null;
  bankDetails?: string | null;
  paymentInstructions?: string | null;
  footerHtml?: string | null;
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

function fmtMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

function replacePlaceholders(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (match, key) => vars[key] ?? match);
}

const s = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: "Helvetica", color: "#111827" },
  // Header
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 },
  invoiceTitle: { fontSize: 22, fontFamily: "Helvetica-Bold", letterSpacing: -0.5 },
  invoiceNumber: { fontSize: 11, color: "#6b7280", marginTop: 4 },
  // Meta table (right side)
  metaRow: { flexDirection: "row", marginBottom: 2 },
  metaLabel: { fontSize: 9, color: "#6b7280", width: 65, textAlign: "right", marginRight: 8 },
  metaValue: { fontSize: 9, fontFamily: "Helvetica-Bold" },
  // From / Bill To
  partiesRow: { flexDirection: "row", gap: 30, marginBottom: 24 },
  partyCol: { flex: 1 },
  partyLabel: { fontSize: 8, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 1.2, color: "#9ca3af", marginBottom: 5 },
  partyName: { fontSize: 11, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  partyDetail: { fontSize: 9, color: "#6b7280", marginBottom: 1 },
  // Table
  table: { marginBottom: 12 },
  tableHeader: { flexDirection: "row", borderBottomWidth: 1.5, borderBottomColor: "#d1d5db", paddingBottom: 5, marginBottom: 3 },
  th: { fontSize: 8, fontFamily: "Helvetica-Bold", color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.5 },
  tableRow: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#e5e7eb", paddingVertical: 5 },
  cellNum: { width: 24, color: "#9ca3af" },
  cellDesc: { flex: 3 },
  cellQty: { flex: 0.8, textAlign: "right" },
  cellPrice: { flex: 1.2, textAlign: "right" },
  cellTax: { flex: 1, textAlign: "right" },
  cellAmount: { flex: 1.2, textAlign: "right" },
  // Totals
  totalsContainer: { alignItems: "flex-end", marginTop: 6 },
  totalRow: { flexDirection: "row", width: 200, justifyContent: "space-between", paddingVertical: 2 },
  totalLabel: { fontSize: 9, color: "#6b7280" },
  totalValue: { fontSize: 9 },
  totalDivider: { flexDirection: "row", width: 200, justifyContent: "space-between", paddingVertical: 3, borderTopWidth: 1.5, borderTopColor: "#111827", marginTop: 2 },
  totalBoldLabel: { fontSize: 10, fontFamily: "Helvetica-Bold" },
  totalBoldValue: { fontSize: 10, fontFamily: "Helvetica-Bold" },
  // Amount Due box
  amountDueBox: { alignItems: "flex-end", marginTop: 12 },
  amountDueInner: { padding: 10, paddingHorizontal: 16, borderRadius: 4, alignItems: "flex-end" },
  amountDueLabel: { fontSize: 7, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 1, color: "#6b7280", marginBottom: 2 },
  amountDueValue: { fontSize: 18, fontFamily: "Helvetica-Bold" },
  // Info sections
  infoSection: { marginTop: 16, padding: 10, backgroundColor: "#f9fafb", borderRadius: 3 },
  infoTitle: { fontSize: 8, fontFamily: "Helvetica-Bold", color: "#374151", marginBottom: 3 },
  infoText: { fontSize: 9, color: "#6b7280", lineHeight: 1.4 },
  // Footer
  footer: { position: "absolute", bottom: 30, left: 40, right: 40, fontSize: 8, color: "#9ca3af", textAlign: "center" },
});

interface InvoiceDocProps {
  invoice: PdfInvoiceData;
  org: OrgInfo;
  contact: ContactInfo;
  template: PdfTemplateSettings;
}

function InvoiceDocument({ invoice: inv, org, contact, template }: InvoiceDocProps) {
  const accent = template.accentColor || "#10b981";
  const taxLabel = getTaxIdLabel(org.countryCode);
  const title = getInvoiceTitle(org.countryCode, !!org.taxId);
  const amountDue = inv.amountDue ?? inv.total;
  const amountPaid = inv.amountPaid ?? 0;

  const vars: Record<string, string> = {
    orgName: org.name, orgAddress: org.address || "", orgTaxId: org.taxId || "",
    orgPhone: org.phone || "", orgEmail: org.email || "", orgRegistrationNumber: org.registrationNumber || "",
    invoiceNumber: inv.invoiceNumber, issueDate: inv.issueDate, dueDate: inv.dueDate,
    contactName: contact.name, contactEmail: contact.email || "", contactAddress: contact.address || "",
    contactTaxNumber: contact.taxNumber || "", reference: inv.reference || "",
    subtotal: fmtMoney(inv.subtotal, inv.currencyCode), taxTotal: fmtMoney(inv.taxTotal, inv.currencyCode),
    total: fmtMoney(inv.total, inv.currencyCode), currency: inv.currencyCode,
  };

  const bankDetailsText = template.bankDetails ? replacePlaceholders(template.bankDetails, vars) : null;
  const paymentInstructionsText = template.paymentInstructions ? replacePlaceholders(template.paymentInstructions, vars) : null;
  const notesText = (template.notes || inv.notes) ? replacePlaceholders(template.notes || inv.notes || "", vars) : null;
  const footerText = template.footerHtml
    ? replacePlaceholders(template.footerHtml, vars).replace(/<[^>]*>/g, "")
    : null;

  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* Header: Title + Meta */}
        <View style={s.header}>
          <View>
            <Text style={[s.invoiceTitle, { color: accent }]}>{title}</Text>
            <Text style={s.invoiceNumber}>{inv.invoiceNumber}</Text>
          </View>
          <View>
            <View style={s.metaRow}>
              <Text style={s.metaLabel}>Issue Date</Text>
              <Text style={s.metaValue}>{inv.issueDate}</Text>
            </View>
            <View style={s.metaRow}>
              <Text style={s.metaLabel}>Due Date</Text>
              <Text style={s.metaValue}>{inv.dueDate}</Text>
            </View>
            {inv.reference && (
              <View style={s.metaRow}>
                <Text style={s.metaLabel}>Reference</Text>
                <Text style={s.metaValue}>{inv.reference}</Text>
              </View>
            )}
          </View>
        </View>

        {/* From / Bill To */}
        <View style={s.partiesRow}>
          <View style={s.partyCol}>
            <Text style={s.partyLabel}>From</Text>
            <Text style={s.partyName}>{org.name}</Text>
            {org.address && <Text style={s.partyDetail}>{org.address}</Text>}
            {org.phone && <Text style={s.partyDetail}>{org.phone}</Text>}
            {org.email && <Text style={s.partyDetail}>{org.email}</Text>}
            {org.taxId && <Text style={s.partyDetail}>{taxLabel}: {org.taxId}</Text>}
            {org.registrationNumber && <Text style={s.partyDetail}>Reg: {org.registrationNumber}</Text>}
          </View>
          <View style={s.partyCol}>
            <Text style={s.partyLabel}>Bill To</Text>
            <Text style={s.partyName}>{contact.name}</Text>
            {contact.address && <Text style={s.partyDetail}>{contact.address}</Text>}
            {contact.email && <Text style={s.partyDetail}>{contact.email}</Text>}
            {contact.taxNumber && <Text style={s.partyDetail}>Tax No: {contact.taxNumber}</Text>}
          </View>
        </View>

        {/* Line Items */}
        <View style={s.table}>
          <View style={s.tableHeader}>
            <Text style={[s.th, s.cellNum]}>#</Text>
            <Text style={[s.th, s.cellDesc]}>Description</Text>
            <Text style={[s.th, s.cellQty]}>Qty</Text>
            <Text style={[s.th, s.cellPrice]}>Unit Price</Text>
            {template.showTaxBreakdown !== false && (
              <Text style={[s.th, s.cellTax]}>Tax</Text>
            )}
            <Text style={[s.th, s.cellAmount]}>Amount</Text>
          </View>
          {inv.lines.map((line, i) => (
            <View key={i} style={s.tableRow}>
              <Text style={[s.cellNum, { fontSize: 9 }]}>{i + 1}</Text>
              <Text style={s.cellDesc}>{line.description}</Text>
              <Text style={s.cellQty}>{(line.quantity / 100).toFixed(2)}</Text>
              <Text style={s.cellPrice}>{fmtMoney(line.unitPrice, inv.currencyCode)}</Text>
              {template.showTaxBreakdown !== false && (
                <Text style={s.cellTax}>{fmtMoney(line.taxAmount, inv.currencyCode)}</Text>
              )}
              <Text style={s.cellAmount}>{fmtMoney(line.amount, inv.currencyCode)}</Text>
            </View>
          ))}
        </View>

        {/* Totals */}
        <View style={s.totalsContainer}>
          <View style={s.totalRow}>
            <Text style={s.totalLabel}>Subtotal</Text>
            <Text style={s.totalValue}>{fmtMoney(inv.subtotal, inv.currencyCode)}</Text>
          </View>
          {template.showTaxBreakdown !== false && inv.taxTotal > 0 && (
            <View style={s.totalRow}>
              <Text style={s.totalLabel}>Tax</Text>
              <Text style={s.totalValue}>{fmtMoney(inv.taxTotal, inv.currencyCode)}</Text>
            </View>
          )}
          <View style={s.totalDivider}>
            <Text style={s.totalBoldLabel}>Total</Text>
            <Text style={s.totalBoldValue}>{fmtMoney(inv.total, inv.currencyCode)}</Text>
          </View>
          {amountPaid > 0 && (
            <View style={s.totalRow}>
              <Text style={s.totalLabel}>Amount Paid</Text>
              <Text style={[s.totalValue, { color: "#059669" }]}>{fmtMoney(amountPaid, inv.currencyCode)}</Text>
            </View>
          )}
        </View>

        {/* Amount Due box */}
        <View style={s.amountDueBox}>
          <View style={[s.amountDueInner, { backgroundColor: `${accent}10` }]}>
            <Text style={s.amountDueLabel}>Amount Due</Text>
            <Text style={[s.amountDueValue, { color: accent }]}>{fmtMoney(amountDue, inv.currencyCode)}</Text>
          </View>
        </View>

        {/* Payment terms */}
        {template.showPaymentTerms !== false && (
          <View style={{ marginTop: 12 }}>
            <Text style={{ fontSize: 9, color: "#6b7280" }}>Payment due by {inv.dueDate}</Text>
          </View>
        )}

        {/* Bank Details */}
        {bankDetailsText && (
          <View style={s.infoSection}>
            <Text style={s.infoTitle}>Bank Details</Text>
            <Text style={s.infoText}>{bankDetailsText}</Text>
          </View>
        )}

        {/* Payment Instructions */}
        {paymentInstructionsText && (
          <View style={s.infoSection}>
            <Text style={s.infoTitle}>Payment Instructions</Text>
            <Text style={s.infoText}>{paymentInstructionsText}</Text>
          </View>
        )}

        {/* Notes */}
        {notesText && (
          <View style={s.infoSection}>
            <Text style={s.infoTitle}>Notes</Text>
            <Text style={s.infoText}>{notesText}</Text>
          </View>
        )}

        {/* Custom footer */}
        {footerText && (
          <Text style={s.footer}>{footerText}</Text>
        )}

        {/* dubbl branding */}
        <View style={{ position: "absolute", bottom: 14, left: 0, right: 0, alignItems: "center" }}>
          <Link src="https://dubbl.dev" style={{ textDecoration: "none" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
              <Svg viewBox="0 0 40 32" width={12} height={9.6}>
                <Path d="M18 4h8a10 10 0 0 1 10 10v4a10 10 0 0 1-10 10h-8V4z" fill="#d1d5db" />
                <Path d="M4 4h8a10 10 0 0 1 10 10v4a10 10 0 0 1-10 10H4V4z" fill="#9ca3af" />
              </Svg>
              <Text style={{ fontSize: 7, color: "#d1d5db", letterSpacing: 0.5 }}>dubbl</Text>
            </View>
          </Link>
        </View>
      </Page>
    </Document>
  );
}

export async function renderInvoicePdf(
  invoice: PdfInvoiceData,
  org: OrgInfo,
  contact: ContactInfo,
  template: PdfTemplateSettings
): Promise<ArrayBuffer> {
  const buffer = await renderToBuffer(
    <InvoiceDocument invoice={invoice} org={org} contact={contact} template={template} />
  );
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
}
