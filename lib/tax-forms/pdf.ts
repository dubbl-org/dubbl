/**
 * Renders a year-end tax form (W-2 or 1099-NEC) as a one-page summary PDF.
 * It lists every stored box; it is a record for the employer and recipient,
 * not the official IRS scannable form.
 */
import React from "react";
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import { w2DisplayRows, type W2DisplayRow } from "./w2";

const h = React.createElement;

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: "Helvetica", color: "#111" },
  title: { fontSize: 16, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  sub: { fontSize: 9, color: "#666", marginBottom: 16 },
  partyRow: { flexDirection: "row", marginBottom: 16 },
  party: { flex: 1, paddingRight: 12 },
  partyLabel: { fontSize: 8, color: "#666", textTransform: "uppercase", marginBottom: 2 },
  partyName: { fontSize: 11, fontFamily: "Helvetica-Bold" },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#ddd", paddingVertical: 5 },
  label: { flex: 1 },
  value: { width: 120, textAlign: "right", fontFamily: "Helvetica-Bold" },
  note: { marginTop: 18, fontSize: 8, color: "#666" },
});

function money(cents: number) {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export interface TaxFormPdfInput {
  formType: string;
  taxYear: number;
  recipientName: string;
  recipientTaxId: string | null;
  formData: Record<string, unknown> | null;
  employer: { name: string; taxId: string | null; address: string | null };
}

function rowsFor(input: TaxFormPdfInput): W2DisplayRow[] {
  const data = input.formData ?? {};
  if (input.formType === "w2") return w2DisplayRows(data);
  const box1 = typeof data.box1_nonemployee_compensation === "number" ? data.box1_nonemployee_compensation : 0;
  return [{ label: "Box 1 - Nonemployee compensation", amount: box1 }];
}

export function taxFormTitle(formType: string) {
  return formType === "w2" ? "W-2" : formType === "1099_misc" ? "1099-MISC" : "1099-NEC";
}

export async function renderTaxFormPdf(input: TaxFormPdfInput): Promise<Buffer> {
  const title = input.formType === "w2" ? "Form W-2 Wage and Tax Statement" : `Form ${taxFormTitle(input.formType)}`;
  const recipientLabel = input.formType === "w2" ? "Employee" : "Recipient";
  const payerLabel = input.formType === "w2" ? "Employer" : "Payer";
  const maskedTin = input.recipientTaxId ? `***-**-${input.recipientTaxId.slice(-4)}` : "Not on file";

  const doc = h(
    Document,
    null,
    h(
      Page,
      { size: "LETTER", style: styles.page },
      h(Text, { style: styles.title }, `${title} ${input.taxYear}`),
      h(Text, { style: styles.sub }, "Summary of the amounts reported. Amounts in USD."),
      h(
        View,
        { style: styles.partyRow },
        h(
          View,
          { style: styles.party },
          h(Text, { style: styles.partyLabel }, payerLabel),
          h(Text, { style: styles.partyName }, input.employer.name),
          input.employer.taxId ? h(Text, null, `EIN ${input.employer.taxId}`) : null,
          input.employer.address ? h(Text, null, input.employer.address) : null
        ),
        h(
          View,
          { style: styles.party },
          h(Text, { style: styles.partyLabel }, recipientLabel),
          h(Text, { style: styles.partyName }, input.recipientName),
          h(Text, null, `Tax ID ${maskedTin}`)
        )
      ),
      ...rowsFor(input).map((r, i) =>
        h(
          View,
          { key: i, style: styles.row },
          h(Text, { style: styles.label }, r.label),
          h(Text, { style: styles.value }, r.amount != null ? money(r.amount) : r.text ?? "")
        )
      ),
      h(
        Text,
        { style: styles.note },
        "This summary is not the official IRS form. File with the IRS / SSA using the official forms or an e-file provider."
      )
    )
  );
  return renderToBuffer(doc as Parameters<typeof renderToBuffer>[0]);
}
