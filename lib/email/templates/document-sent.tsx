import {
  Section,
  Text,
  Button,
} from "@react-email/components";
import * as React from "react";
import { EmailLayout } from "./layout";

interface DocumentSentEmailProps {
  body: string;
  organizationName: string;
  documentType: string;
  documentNumber: string;
  viewUrl?: string;
}

const documentTypeLabels: Record<string, string> = {
  invoice: "Invoice",
  quote: "Quote",
  credit_note: "Credit Note",
  purchase_order: "Purchase Order",
  debit_note: "Debit Note",
};

export function DocumentSentEmail({
  body,
  organizationName = "Your Company",
  documentType = "invoice",
  documentNumber = "",
  viewUrl,
}: DocumentSentEmailProps) {
  const typeLabel = documentTypeLabels[documentType] || "Document";
  const preview = `${typeLabel} ${documentNumber} from ${organizationName}`;

  return (
    <EmailLayout preview={preview}>
      <Section style={content}>
        <Text style={heading}>
          {typeLabel} {documentNumber}
        </Text>
        <Text style={fromLine}>From {organizationName}</Text>
        <div
          style={bodySection}
          dangerouslySetInnerHTML={{ __html: body }}
        />
        {viewUrl && (
          <Section style={buttonSection}>
            <Button style={button} href={viewUrl}>
              View {typeLabel}
            </Button>
          </Section>
        )}
      </Section>
    </EmailLayout>
  );
}

export default DocumentSentEmail;

const content: React.CSSProperties = { padding: "24px 40px 32px" };
const heading: React.CSSProperties = {
  fontSize: "22px",
  fontWeight: 700,
  color: "#111827",
  margin: "0 0 4px",
};
const fromLine: React.CSSProperties = {
  fontSize: "14px",
  color: "#6b7280",
  margin: "0 0 20px",
};
const bodySection: React.CSSProperties = {
  fontSize: "15px",
  color: "#374151",
  lineHeight: "24px",
};
const buttonSection: React.CSSProperties = {
  textAlign: "center" as const,
  marginTop: "24px",
};
const button: React.CSSProperties = {
  backgroundColor: "#059669",
  borderRadius: "8px",
  color: "#fff",
  fontSize: "14px",
  fontWeight: 600,
  textDecoration: "none",
  textAlign: "center" as const,
  padding: "12px 32px",
};
