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
  discountPercent?: number;
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
  if ((cc === "AU" || cc === "NZ") && hasTaxId) return "Tax Invoice";
  return "Invoice";
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

// Colors
const dark = "#111827";
const gray = "#6b7280";
const lightGray = "#e5e7eb";

const s = StyleSheet.create({
  page: { paddingTop: 0, paddingBottom: 50, paddingHorizontal: 40, fontSize: 9, fontFamily: "Helvetica", color: dark },
  // Accent bar
  accentBar: { height: 4, marginBottom: 30 },
  // Header
  title: { fontSize: 18, fontFamily: "Helvetica-Bold", color: dark, marginBottom: 20 },
  // Metadata
  metaBlock: { marginBottom: 20 },
  metaRow: { flexDirection: "row", marginBottom: 2 },
  metaLabel: { width: 80, fontSize: 9, color: gray },
  metaValue: { fontSize: 9, fontFamily: "Helvetica-Bold" },
  // Parties
  partiesRow: { flexDirection: "row", marginBottom: 20 },
  sellerCol: { width: 200, marginRight: 40 },
  buyerCol: { width: 200 },
  partyName: { fontSize: 10, fontFamily: "Helvetica-Bold", marginBottom: 3 },
  partyDetail: { fontSize: 9, color: gray, marginBottom: 1 },
  billToLabel: { fontSize: 10, fontFamily: "Helvetica-Bold", marginBottom: 3 },
  // Due summary
  dueSummary: { fontSize: 14, fontFamily: "Helvetica-Bold", color: dark, marginBottom: 20 },
  // Table
  table: { marginBottom: 0 },
  tableHeader: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: dark, paddingBottom: 6, marginBottom: 4 },
  th: { fontSize: 8, color: gray },
  tableRow: { flexDirection: "row", paddingVertical: 4 },
  cellDesc: { flex: 3 },
  cellQty: { flex: 0.6, textAlign: "right" },
  cellPrice: { flex: 1.2, textAlign: "right" },
  cellDiscount: { flex: 0.8, textAlign: "right" },
  cellAmount: { flex: 1.3, textAlign: "right" },
  // Totals
  totalsContainer: { flexDirection: "row", justifyContent: "flex-end", marginTop: 20 },
  totalsBlock: { width: "50%" },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2, borderTopWidth: 0.5, borderTopColor: lightGray },
  totalLabel: { fontSize: 9, color: gray },
  totalValue: { fontSize: 9, color: dark },
  amountDueRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3, borderTopWidth: 0.5, borderTopColor: lightGray },
  amountDueLabel: { fontSize: 9, fontFamily: "Helvetica-Bold", color: dark },
  amountDueValue: { fontSize: 9, fontFamily: "Helvetica-Bold", color: dark },
  // Info sections
  infoSection: { marginTop: 20 },
  infoTitle: { fontSize: 9, fontFamily: "Helvetica-Bold", color: dark, marginBottom: 3 },
  infoText: { fontSize: 9, color: gray, lineHeight: 1.4 },
  // Footer
  footer: { position: "absolute", bottom: 20, left: 40, right: 40, borderTopWidth: 0.5, borderTopColor: lightGray, paddingTop: 8, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  footerText: { fontSize: 8, color: gray },
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
  const hasDiscount = inv.lines.some((l) => l.discountPercent && l.discountPercent > 0);

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
        {/* Thin accent bar at top */}
        <View style={[s.accentBar, { backgroundColor: accent }]} />

        {/* Invoice title */}
        <Text style={s.title}>{title}</Text>

        {/* Metadata */}
        <View style={s.metaBlock}>
          <View style={s.metaRow}>
            <Text style={[s.metaLabel, { fontFamily: "Helvetica-Bold" }]}>Invoice number</Text>
            <Text style={s.metaValue}>{inv.invoiceNumber}</Text>
          </View>
          <View style={s.metaRow}>
            <Text style={s.metaLabel}>Date of issue</Text>
            <Text style={{ fontSize: 9 }}>{inv.issueDate}</Text>
          </View>
          <View style={s.metaRow}>
            <Text style={s.metaLabel}>Date due</Text>
            <Text style={{ fontSize: 9 }}>{inv.dueDate}</Text>
          </View>
          {inv.reference && (
            <View style={s.metaRow}>
              <Text style={s.metaLabel}>Reference</Text>
              <Text style={{ fontSize: 9 }}>{inv.reference}</Text>
            </View>
          )}
        </View>

        {/* Seller and Buyer */}
        <View style={s.partiesRow}>
          <View style={s.sellerCol}>
            <Text style={s.partyName}>{org.name}</Text>
            {org.address && <Text style={s.partyDetail}>{org.address}</Text>}
            {org.email && <Text style={s.partyDetail}>{org.email}</Text>}
            {org.phone && <Text style={s.partyDetail}>{org.phone}</Text>}
            {org.taxId && <Text style={s.partyDetail}>{taxLabel}: {org.taxId}</Text>}
            {org.registrationNumber && <Text style={s.partyDetail}>Reg: {org.registrationNumber}</Text>}
          </View>
          <View style={s.buyerCol}>
            <Text style={s.billToLabel}>Bill to</Text>
            <Text style={s.partyDetail}>{contact.name}</Text>
            {contact.address && <Text style={s.partyDetail}>{contact.address}</Text>}
            {contact.email && <Text style={s.partyDetail}>{contact.email}</Text>}
            {contact.taxNumber && <Text style={s.partyDetail}>{taxLabel}: {contact.taxNumber}</Text>}
          </View>
        </View>

        {/* Due amount summary */}
        <Text style={s.dueSummary}>
          {fmtMoney(amountDue, inv.currencyCode)} due {inv.dueDate}
        </Text>

        {/* Line Items */}
        <View style={s.table}>
          <View style={s.tableHeader}>
            <Text style={[s.th, s.cellDesc]}>Description</Text>
            <Text style={[s.th, s.cellQty]}>Qty</Text>
            <Text style={[s.th, s.cellPrice]}>Unit price</Text>
            {hasDiscount && <Text style={[s.th, s.cellDiscount]}>Discount</Text>}
            <Text style={[s.th, s.cellAmount]}>Amount</Text>
          </View>
          {inv.lines.map((line, i) => (
            <View key={i} style={s.tableRow}>
              <Text style={[s.cellDesc, { fontSize: 10 }]}>{line.description}</Text>
              <Text style={[s.cellQty, { color: dark }]}>{(line.quantity / 100).toFixed(2)}</Text>
              <Text style={[s.cellPrice, { color: dark }]}>{fmtMoney(line.unitPrice, inv.currencyCode)}</Text>
              {hasDiscount && (
                <Text style={[s.cellDiscount, { color: dark }]}>
                  {line.discountPercent ? `${(line.discountPercent / 100).toFixed(2)}%` : "-"}
                </Text>
              )}
              <Text style={[s.cellAmount, { color: dark }]}>{fmtMoney(line.amount, inv.currencyCode)}</Text>
            </View>
          ))}
        </View>

        {/* Totals */}
        <View style={s.totalsContainer}>
          <View style={s.totalsBlock}>
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
            <View style={s.totalRow}>
              <Text style={s.totalLabel}>Total</Text>
              <Text style={s.totalValue}>{fmtMoney(inv.total, inv.currencyCode)}</Text>
            </View>
            {amountPaid > 0 && (
              <View style={s.totalRow}>
                <Text style={s.totalLabel}>Amount paid</Text>
                <Text style={s.totalValue}>{fmtMoney(amountPaid, inv.currencyCode)}</Text>
              </View>
            )}
            <View style={s.amountDueRow}>
              <Text style={s.amountDueLabel}>Amount due</Text>
              <Text style={s.amountDueValue}>{fmtMoney(amountDue, inv.currencyCode)}</Text>
            </View>
          </View>
        </View>

        {/* Bank Details */}
        {bankDetailsText && (
          <View style={s.infoSection}>
            <Text style={s.infoTitle}>Bank details</Text>
            <Text style={s.infoText}>{bankDetailsText}</Text>
          </View>
        )}

        {/* Payment Instructions */}
        {paymentInstructionsText && (
          <View style={s.infoSection}>
            <Text style={s.infoTitle}>Payment instructions</Text>
            <Text style={s.infoText}>{paymentInstructionsText}</Text>
          </View>
        )}

        {/* Notes */}
        {notesText && (
          <View style={s.infoSection}>
            <Text style={s.infoText}>{notesText}</Text>
          </View>
        )}

        {/* Footer */}
        <View style={s.footer} fixed>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text style={s.footerText}>{inv.invoiceNumber}</Text>
            <Text style={s.footerText}>{fmtMoney(amountDue, inv.currencyCode)} due {inv.dueDate}</Text>
            {footerText && <Text style={s.footerText}>{footerText}</Text>}
          </View>
          <Link src="https://dubbl.dev" style={{ textDecoration: "none" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
              <Svg viewBox="0 0 40 32" width={10} height={8}>
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
