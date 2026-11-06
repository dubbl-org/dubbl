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
  Image,
} from "@react-pdf/renderer";
import { loadLogoImage, type LogoImage } from "./logo";
import { formatMoney } from "@/lib/money";
import { paymentTermsText, replacePlaceholders, safeAccentColor, templateBlockText } from "./template-text";

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
  logoUrl?: string | null;
  showTaxBreakdown?: boolean;
  showPaymentTerms?: boolean;
  notes?: string | null;
  bankDetails?: string | null;
  paymentInstructions?: string | null;
  headerHtml?: string | null;
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

// Scales by the currency's own minor units (JPY 0, USD 2, KWD 3).
function fmtMoney(minorUnits: number, currency: string): string {
  return formatMoney(minorUnits, currency);
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
  // Template branding
  logo: { maxHeight: 48, maxWidth: 160, objectFit: "contain", objectPositionX: 0, marginBottom: 14 },
  headerText: { fontSize: 9, color: gray, lineHeight: 1.4, marginBottom: 16 },
  footerNote: { position: "absolute", left: 40, right: 40, fontSize: 8, color: gray, lineHeight: 1.4 },
  // Payslip sections
  sectionTitle: { fontSize: 10, fontFamily: "Helvetica-Bold", color: dark, marginTop: 18, marginBottom: 4 },
  payTable: { width: "100%" },
});

// Gap between the template's footer text and the fixed footer bar, per line.
const FOOTER_LINE_HEIGHT = 11;

/** The template's logo (if any) and header text, printed above the title. */
function TemplateHeader({ logo, headerText }: { logo: LogoImage | null; headerText: string | null }) {
  return (
    <>
      {/* react-pdf Image, not an HTML <img>: it has no alt prop. */}
      {/* eslint-disable-next-line jsx-a11y/alt-text */}
      {logo && <Image src={logo} style={s.logo} />}
      {headerText && <Text style={s.headerText}>{headerText}</Text>}
    </>
  );
}

/** Template footer text, fixed just above the footer bar on every page. */
function TemplateFooterNote({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <Text style={[s.footerNote, { bottom: 40 }]} fixed>
      {text}
    </Text>
  );
}

// Extra bottom padding so page content never runs under the footer text.
function pagePaddingBottom(footerText: string | null): number {
  return footerText ? 50 + footerText.split("\n").length * FOOTER_LINE_HEIGHT + 6 : 50;
}

function DubblMark() {
  return (
    <Link src="https://dubbl.dev" style={{ textDecoration: "none" }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
        <Svg viewBox="0 0 40 32" width={10} height={8}>
          <Path d="M18 4v.19a11.5 11.5 0 0 1 5.5 9.81v4a11.5 11.5 0 0 1-5.5 9.81V28h8a10 10 0 0 0 10-10v-4A10 10 0 0 0 26 4h-8z" fill="#c4c4c0" />
          <Path d="M4 4h8a10 10 0 0 1 10 10v4a10 10 0 0 1-10 10H4V4z" fill="#c4c4c0" />
        </Svg>
        <Text style={{ fontSize: 7, color: "#d1d5db", letterSpacing: 0.5 }}>dubbl</Text>
      </View>
    </Link>
  );
}

export interface PdfDocumentLabels {
  title?: string;
  numberLabel?: string;
  partyLabel?: string;
  amountLabel?: string;
  // Label for the second-date metadata row. Defaults to "Date due" (invoice).
  // Pass null to hide the row entirely (e.g. credit/debit notes have no due date).
  dateLabel?: string | null;
  // Whether the document has payment terms the template's Show Payment Terms
  // switch controls (due date row, "due {date}" summary and the Payment terms
  // line). Defaults to true only for the invoice-shaped default labels.
  paymentTerms?: boolean;
  // The connecting word in the headline/footer summary "{amount} {noun} {date}".
  // Defaults to "due" (invoice). Pass null to show just the amount with no date
  // (e.g. a credit note or purchase order isn't "due" on a date).
  summaryNoun?: string | null;
}

interface InvoiceDocProps {
  invoice: PdfInvoiceData;
  org: OrgInfo;
  contact: ContactInfo;
  template: PdfTemplateSettings;
  labels?: PdfDocumentLabels;
  logo: LogoImage | null;
}

function InvoiceDocument({ invoice: inv, org, contact, template, labels, logo }: InvoiceDocProps) {
  const accent = safeAccentColor(template.accentColor);
  const taxLabel = getTaxIdLabel(org.countryCode);
  const title = labels?.title ?? getInvoiceTitle(org.countryCode, !!org.taxId);
  const amountDue = inv.amountDue ?? inv.total;
  const amountPaid = inv.amountPaid ?? 0;
  const hasDiscount = inv.lines.some((l) => l.discountPercent && l.discountPercent > 0);

  // The second-date row and the headline/footer summary are invoice-shaped by
  // default ("Date due" / "{amount} due {date}"). Other document types override
  // the wording or suppress them: dateLabel === null hides the date row, and
  // summaryNoun === null shows just the amount with no "due {date}".
  // Show Payment Terms off hides everything about when an invoice is due.
  const hasPaymentTerms = labels?.paymentTerms ?? (labels?.dateLabel === undefined && labels?.summaryNoun === undefined);
  const hideTerms = hasPaymentTerms && template.showPaymentTerms === false;
  const showDateRow = labels?.dateLabel !== null && !hideTerms;
  const dateRowLabel = labels?.dateLabel ?? "Date due";
  const summaryNoun = hideTerms ? null : labels?.summaryNoun === undefined ? "due" : labels.summaryNoun;
  const summaryText = summaryNoun
    ? `${fmtMoney(amountDue, inv.currencyCode)} ${summaryNoun} ${inv.dueDate}`
    : fmtMoney(amountDue, inv.currencyCode);

  const vars: Record<string, string> = {
    orgName: org.name, orgAddress: org.address || "", orgTaxId: org.taxId || "",
    orgPhone: org.phone || "", orgEmail: org.email || "", orgRegistrationNumber: org.registrationNumber || "",
    invoiceNumber: inv.invoiceNumber, issueDate: inv.issueDate, dueDate: inv.dueDate,
    contactName: contact.name, contactEmail: contact.email || "", contactAddress: contact.address || "",
    contactTaxNumber: contact.taxNumber || "", reference: inv.reference || "",
    subtotal: fmtMoney(inv.subtotal, inv.currencyCode), taxTotal: fmtMoney(inv.taxTotal, inv.currencyCode),
    total: fmtMoney(inv.total, inv.currencyCode), currency: inv.currencyCode,
    documentNumber: inv.invoiceNumber,
  };

  const bankDetailsText = template.bankDetails ? replacePlaceholders(template.bankDetails, vars) : null;
  const paymentInstructionsText = template.paymentInstructions ? replacePlaceholders(template.paymentInstructions, vars) : null;
  const notesText = (template.notes || inv.notes) ? replacePlaceholders(template.notes || inv.notes || "", vars) : null;
  const headerText = templateBlockText(template.headerHtml, vars);
  const footerText = templateBlockText(template.footerHtml, vars);
  const termsText = hasPaymentTerms && !hideTerms ? paymentTermsText(inv.issueDate, inv.dueDate) : null;

  return (
    <Document>
      <Page size="A4" style={[s.page, { paddingBottom: pagePaddingBottom(footerText) }]}>
        {/* Thin accent bar at top */}
        <View style={[s.accentBar, { backgroundColor: accent }]} />

        <TemplateHeader logo={logo} headerText={headerText} />

        {/* Invoice title */}
        <Text style={s.title}>{title}</Text>

        {/* Metadata */}
        <View style={s.metaBlock}>
          <View style={s.metaRow}>
            <Text style={[s.metaLabel, { fontFamily: "Helvetica-Bold" }]}>{labels?.numberLabel ?? "Invoice number"}</Text>
            <Text style={s.metaValue}>{inv.invoiceNumber}</Text>
          </View>
          <View style={s.metaRow}>
            <Text style={s.metaLabel}>Date of issue</Text>
            <Text style={{ fontSize: 9 }}>{inv.issueDate}</Text>
          </View>
          {showDateRow && (
            <View style={s.metaRow}>
              <Text style={s.metaLabel}>{dateRowLabel}</Text>
              <Text style={{ fontSize: 9 }}>{inv.dueDate}</Text>
            </View>
          )}
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
            <Text style={s.billToLabel}>{labels?.partyLabel ?? "Bill to"}</Text>
            <Text style={s.partyDetail}>{contact.name}</Text>
            {contact.address && <Text style={s.partyDetail}>{contact.address}</Text>}
            {contact.email && <Text style={s.partyDetail}>{contact.email}</Text>}
            {contact.taxNumber && <Text style={s.partyDetail}>{taxLabel}: {contact.taxNumber}</Text>}
          </View>
        </View>

        {/* Headline amount summary */}
        <Text style={s.dueSummary}>{summaryText}</Text>

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
              <Text style={s.amountDueLabel}>{labels?.amountLabel ?? "Amount due"}</Text>
              <Text style={s.amountDueValue}>{fmtMoney(amountDue, inv.currencyCode)}</Text>
            </View>
          </View>
        </View>

        {/* Payment terms */}
        {termsText && (
          <View style={s.infoSection}>
            <Text style={s.infoTitle}>Payment terms</Text>
            <Text style={s.infoText}>{termsText}</Text>
          </View>
        )}

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

        {/* Template footer text + footer bar */}
        <TemplateFooterNote text={footerText} />
        <View style={s.footer} fixed>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text style={s.footerText}>{inv.invoiceNumber}</Text>
            <Text style={s.footerText}>{summaryText}</Text>
          </View>
          <DubblMark />
        </View>
      </Page>
    </Document>
  );
}

export async function renderInvoicePdf(
  invoice: PdfInvoiceData,
  org: OrgInfo,
  contact: ContactInfo,
  template: PdfTemplateSettings,
  labels?: PdfDocumentLabels
): Promise<ArrayBuffer> {
  const logo = await loadLogoImage(template.logoUrl);
  const buffer = await renderToBuffer(
    <InvoiceDocument invoice={invoice} org={org} contact={contact} template={template} labels={labels} logo={logo} />
  );
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
}

// ---------------------------------------------------------------- Payslips

export interface PdfPayslipLine {
  description: string;
  amount: number; // cents
}

export interface PdfPayslipData {
  employeeName: string;
  employeeNumber?: string | null;
  position?: string | null;
  department?: string | null;
  employeeEmail?: string | null;
  payPeriodStart: string;
  payPeriodEnd: string;
  payDate?: string | null;
  currencyCode: string;
  earnings: PdfPayslipLine[];
  grossAmount: number;
  taxAmount: number;
  // Per-tax split (income tax, social security, ...). Shown instead of a single
  // "Tax withheld" line when the template's Show Tax Breakdown is on.
  taxLines?: PdfPayslipLine[];
  deductions: PdfPayslipLine[];
  netAmount: number;
  ytdGross: number;
  ytdTax: number;
  ytdNet: number;
}

interface PayslipDocProps {
  slip: PdfPayslipData;
  org: OrgInfo;
  template: PdfTemplateSettings;
  logo: LogoImage | null;
}

function MoneyRow({ label, amount, currency, bold }: { label: string; amount: number; currency: string; bold?: boolean }) {
  return (
    <View style={s.totalRow}>
      <Text style={bold ? s.amountDueLabel : [s.totalLabel, { color: dark }]}>{label}</Text>
      <Text style={bold ? s.amountDueValue : s.totalValue}>{fmtMoney(amount, currency)}</Text>
    </View>
  );
}

function PayslipDocument({ slip, org, template, logo }: PayslipDocProps) {
  const accent = safeAccentColor(template.accentColor);
  const cur = slip.currencyCode;
  const period = `${slip.payPeriodStart} to ${slip.payPeriodEnd}`;
  const totalDeductions = slip.grossAmount - slip.netAmount;
  const taxLines =
    template.showTaxBreakdown !== false && slip.taxLines && slip.taxLines.length > 0
      ? slip.taxLines
      : [{ description: "Tax withheld", amount: slip.taxAmount }];

  const vars: Record<string, string> = {
    orgName: org.name, orgAddress: org.address || "", orgTaxId: org.taxId || "",
    orgPhone: org.phone || "", orgEmail: org.email || "", orgRegistrationNumber: org.registrationNumber || "",
    employeeName: slip.employeeName, employeeNumber: slip.employeeNumber || "",
    payPeriodStart: slip.payPeriodStart, payPeriodEnd: slip.payPeriodEnd, payDate: slip.payDate || "",
    issueDate: slip.payDate || slip.payPeriodEnd,
    grossPay: fmtMoney(slip.grossAmount, cur), netPay: fmtMoney(slip.netAmount, cur),
    total: fmtMoney(slip.netAmount, cur), currency: cur,
  };

  const headerText = templateBlockText(template.headerHtml, vars);
  const footerText = templateBlockText(template.footerHtml, vars);
  const bankDetailsText = template.bankDetails ? replacePlaceholders(template.bankDetails, vars) : null;
  const paymentInstructionsText = template.paymentInstructions ? replacePlaceholders(template.paymentInstructions, vars) : null;
  const notesText = template.notes ? replacePlaceholders(template.notes, vars) : null;

  return (
    <Document>
      <Page size="A4" style={[s.page, { paddingBottom: pagePaddingBottom(footerText) }]}>
        <View style={[s.accentBar, { backgroundColor: accent }]} />

        <TemplateHeader logo={logo} headerText={headerText} />

        <Text style={s.title}>Payslip</Text>

        <View style={s.metaBlock}>
          <View style={s.metaRow}>
            <Text style={[s.metaLabel, { fontFamily: "Helvetica-Bold" }]}>Pay period</Text>
            <Text style={s.metaValue}>{period}</Text>
          </View>
          {slip.payDate && (
            <View style={s.metaRow}>
              <Text style={s.metaLabel}>Pay date</Text>
              <Text style={{ fontSize: 9 }}>{slip.payDate}</Text>
            </View>
          )}
          {slip.employeeNumber && (
            <View style={s.metaRow}>
              <Text style={s.metaLabel}>Employee no.</Text>
              <Text style={{ fontSize: 9 }}>{slip.employeeNumber}</Text>
            </View>
          )}
        </View>

        <View style={s.partiesRow}>
          <View style={s.sellerCol}>
            <Text style={s.partyName}>{org.name}</Text>
            {org.address && <Text style={s.partyDetail}>{org.address}</Text>}
            {org.email && <Text style={s.partyDetail}>{org.email}</Text>}
            {org.phone && <Text style={s.partyDetail}>{org.phone}</Text>}
            {org.registrationNumber && <Text style={s.partyDetail}>Reg: {org.registrationNumber}</Text>}
          </View>
          <View style={s.buyerCol}>
            <Text style={s.billToLabel}>Employee</Text>
            <Text style={s.partyDetail}>{slip.employeeName}</Text>
            {slip.position && <Text style={s.partyDetail}>{slip.position}</Text>}
            {slip.department && <Text style={s.partyDetail}>{slip.department}</Text>}
            {slip.employeeEmail && <Text style={s.partyDetail}>{slip.employeeEmail}</Text>}
          </View>
        </View>

        <Text style={s.dueSummary}>{fmtMoney(slip.netAmount, cur)} take-home pay</Text>

        <Text style={[s.sectionTitle, { marginTop: 0 }]}>Earnings</Text>
        <View style={s.payTable}>
          {slip.earnings.map((l, i) => (
            <MoneyRow key={i} label={l.description} amount={l.amount} currency={cur} />
          ))}
          <MoneyRow label="Gross pay" amount={slip.grossAmount} currency={cur} bold />
        </View>

        <Text style={s.sectionTitle}>Taxes and deductions</Text>
        <View style={s.payTable}>
          {taxLines.map((l, i) => (
            <MoneyRow key={`t${i}`} label={l.description} amount={l.amount} currency={cur} />
          ))}
          {slip.deductions.map((l, i) => (
            <MoneyRow key={`d${i}`} label={l.description} amount={l.amount} currency={cur} />
          ))}
          <MoneyRow label="Total deductions" amount={totalDeductions} currency={cur} bold />
        </View>

        <View style={[s.payTable, { marginTop: 14 }]}>
          <MoneyRow label="Net pay" amount={slip.netAmount} currency={cur} bold />
        </View>

        <Text style={s.sectionTitle}>Year to date</Text>
        <View style={s.payTable}>
          <MoneyRow label="Gross pay" amount={slip.ytdGross} currency={cur} />
          <MoneyRow label="Tax" amount={slip.ytdTax} currency={cur} />
          <MoneyRow label="Net pay" amount={slip.ytdNet} currency={cur} />
        </View>

        {bankDetailsText && (
          <View style={s.infoSection}>
            <Text style={s.infoTitle}>Bank details</Text>
            <Text style={s.infoText}>{bankDetailsText}</Text>
          </View>
        )}

        {paymentInstructionsText && (
          <View style={s.infoSection}>
            <Text style={s.infoTitle}>Payment instructions</Text>
            <Text style={s.infoText}>{paymentInstructionsText}</Text>
          </View>
        )}

        {notesText && (
          <View style={s.infoSection}>
            <Text style={s.infoText}>{notesText}</Text>
          </View>
        )}

        <TemplateFooterNote text={footerText} />
        <View style={s.footer} fixed>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text style={s.footerText}>{slip.employeeName}</Text>
            <Text style={s.footerText}>Pay period {period}</Text>
          </View>
          <DubblMark />
        </View>
      </Page>
    </Document>
  );
}

export async function renderPayslipPdf(
  slip: PdfPayslipData,
  org: OrgInfo,
  template: PdfTemplateSettings
): Promise<ArrayBuffer> {
  const logo = await loadLogoImage(template.logoUrl);
  const buffer = await renderToBuffer(<PayslipDocument slip={slip} org={org} template={template} logo={logo} />);
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
}
