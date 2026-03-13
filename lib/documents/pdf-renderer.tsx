import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
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

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: "Helvetica", color: "#111827" },
  header: { flexDirection: "row", justifyContent: "space-between", marginBottom: 24 },
  orgName: { fontSize: 16, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  orgDetail: { fontSize: 9, color: "#6b7280", marginBottom: 1 },
  invoiceTitle: { fontSize: 22, fontFamily: "Helvetica-Bold", textAlign: "right" },
  invoiceMeta: { fontSize: 10, color: "#6b7280", textAlign: "right", marginTop: 2 },
  sectionTitle: { fontSize: 9, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 },
  contactName: { fontSize: 11, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  contactDetail: { fontSize: 9, color: "#6b7280", marginBottom: 1 },
  table: { marginTop: 16, marginBottom: 16 },
  tableHeader: { flexDirection: "row", borderBottomWidth: 1.5, borderBottomColor: "#d1d5db", paddingBottom: 6, marginBottom: 4 },
  tableHeaderCell: { fontSize: 9, fontFamily: "Helvetica-Bold", color: "#6b7280", textTransform: "uppercase" },
  tableRow: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#e5e7eb", paddingVertical: 5 },
  cellDesc: { flex: 3 },
  cellQty: { flex: 1, textAlign: "right" },
  cellPrice: { flex: 1.2, textAlign: "right" },
  cellTax: { flex: 1, textAlign: "right" },
  cellAmount: { flex: 1.2, textAlign: "right" },
  totalsContainer: { alignItems: "flex-end", marginTop: 8 },
  totalRow: { flexDirection: "row", width: 220, justifyContent: "space-between", paddingVertical: 2 },
  totalLabel: { fontSize: 10, color: "#6b7280" },
  totalValue: { fontSize: 10, fontFamily: "Helvetica" },
  totalGrandRow: { flexDirection: "row", width: 220, justifyContent: "space-between", paddingVertical: 4, borderTopWidth: 1.5, borderTopColor: "#111827", marginTop: 2 },
  totalGrandLabel: { fontSize: 11, fontFamily: "Helvetica-Bold" },
  totalGrandValue: { fontSize: 11, fontFamily: "Helvetica-Bold" },
  infoSection: { marginTop: 20, padding: 10, backgroundColor: "#f9fafb", borderRadius: 3 },
  infoTitle: { fontSize: 9, fontFamily: "Helvetica-Bold", color: "#374151", marginBottom: 4 },
  infoText: { fontSize: 9, color: "#6b7280", lineHeight: 1.4 },
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

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.orgName, { color: accent }]}>{org.name}</Text>
            {org.address && <Text style={styles.orgDetail}>{org.address}</Text>}
            {org.taxId && <Text style={styles.orgDetail}>{taxLabel}: {org.taxId}</Text>}
            {org.registrationNumber && <Text style={styles.orgDetail}>Reg: {org.registrationNumber}</Text>}
            {org.phone && <Text style={styles.orgDetail}>Phone: {org.phone}</Text>}
            {org.email && <Text style={styles.orgDetail}>{org.email}</Text>}
            {org.website && <Text style={styles.orgDetail}>{org.website}</Text>}
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={[styles.invoiceTitle, { color: accent }]}>{title}</Text>
            <Text style={styles.invoiceMeta}>{inv.invoiceNumber}</Text>
            <Text style={styles.invoiceMeta}>Date: {inv.issueDate}</Text>
            {inv.reference && <Text style={styles.invoiceMeta}>Ref: {inv.reference}</Text>}
          </View>
        </View>

        {/* Bill To */}
        <View style={{ marginBottom: 16 }}>
          <Text style={styles.sectionTitle}>Bill To</Text>
          <Text style={styles.contactName}>{contact.name}</Text>
          {contact.address && <Text style={styles.contactDetail}>{contact.address}</Text>}
          {contact.taxNumber && <Text style={styles.contactDetail}>Tax No: {contact.taxNumber}</Text>}
          {contact.email && <Text style={styles.contactDetail}>{contact.email}</Text>}
        </View>

        {/* Line Items Table */}
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderCell, styles.cellDesc]}>Description</Text>
            <Text style={[styles.tableHeaderCell, styles.cellQty]}>Qty</Text>
            <Text style={[styles.tableHeaderCell, styles.cellPrice]}>Price</Text>
            {template.showTaxBreakdown !== false && (
              <Text style={[styles.tableHeaderCell, styles.cellTax]}>Tax</Text>
            )}
            <Text style={[styles.tableHeaderCell, styles.cellAmount]}>Amount</Text>
          </View>
          {inv.lines.map((line, i) => (
            <View key={i} style={styles.tableRow}>
              <Text style={styles.cellDesc}>{line.description}</Text>
              <Text style={styles.cellQty}>{(line.quantity / 100).toFixed(2)}</Text>
              <Text style={styles.cellPrice}>{fmtMoney(line.unitPrice, inv.currencyCode)}</Text>
              {template.showTaxBreakdown !== false && (
                <Text style={styles.cellTax}>{fmtMoney(line.taxAmount, inv.currencyCode)}</Text>
              )}
              <Text style={styles.cellAmount}>{fmtMoney(line.amount, inv.currencyCode)}</Text>
            </View>
          ))}
        </View>

        {/* Totals */}
        <View style={styles.totalsContainer}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Subtotal</Text>
            <Text style={styles.totalValue}>{fmtMoney(inv.subtotal, inv.currencyCode)}</Text>
          </View>
          {template.showTaxBreakdown !== false && inv.taxTotal > 0 && (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Tax</Text>
              <Text style={styles.totalValue}>{fmtMoney(inv.taxTotal, inv.currencyCode)}</Text>
            </View>
          )}
          <View style={styles.totalGrandRow}>
            <Text style={styles.totalGrandLabel}>Total</Text>
            <Text style={styles.totalGrandValue}>{fmtMoney(inv.total, inv.currencyCode)}</Text>
          </View>
          {amountPaid > 0 && (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Amount Paid</Text>
              <Text style={styles.totalValue}>{fmtMoney(amountPaid, inv.currencyCode)}</Text>
            </View>
          )}
          {amountPaid > 0 && (
            <View style={[styles.totalRow, { borderTopWidth: 0.5, borderTopColor: "#d1d5db", marginTop: 2, paddingTop: 4 }]}>
              <Text style={[styles.totalLabel, { fontFamily: "Helvetica-Bold", color: "#111827" }]}>Amount Due</Text>
              <Text style={[styles.totalValue, { fontFamily: "Helvetica-Bold" }]}>{fmtMoney(amountDue, inv.currencyCode)}</Text>
            </View>
          )}
        </View>

        {/* Due date */}
        {template.showPaymentTerms !== false && (
          <View style={{ marginTop: 12 }}>
            <Text style={{ fontSize: 9, color: "#6b7280" }}>Due Date: {inv.dueDate}</Text>
          </View>
        )}

        {/* Bank Details */}
        {template.bankDetails && (
          <View style={styles.infoSection}>
            <Text style={styles.infoTitle}>Bank Details</Text>
            <Text style={styles.infoText}>{template.bankDetails}</Text>
          </View>
        )}

        {/* Payment Instructions */}
        {template.paymentInstructions && (
          <View style={styles.infoSection}>
            <Text style={styles.infoTitle}>Payment Instructions</Text>
            <Text style={styles.infoText}>{template.paymentInstructions}</Text>
          </View>
        )}

        {/* Notes */}
        {(template.notes || inv.notes) && (
          <View style={styles.infoSection}>
            <Text style={styles.infoTitle}>Notes</Text>
            <Text style={styles.infoText}>{template.notes || inv.notes}</Text>
          </View>
        )}

        {/* Footer */}
        {template.footerHtml && (
          <Text style={styles.footer}>{template.footerHtml.replace(/<[^>]*>/g, "")}</Text>
        )}
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
