import {
  Section,
  Text,
  Button,
  Hr,
} from "@react-email/components";
import * as React from "react";
import { EmailLayout } from "./layout";

export interface DocumentSentEmailProps {
  organizationName: string;
  contactName: string;
  documentType: string;
  documentNumber: string;
  personalMessage?: string;
  amountFormatted?: string;
  dueDateFormatted?: string;
  issueDateFormatted?: string;
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
  organizationName = "Your Company",
  contactName = "there",
  documentType = "invoice",
  documentNumber = "",
  personalMessage,
  amountFormatted,
  dueDateFormatted,
  issueDateFormatted,
  viewUrl,
}: DocumentSentEmailProps) {
  const typeLabel = documentTypeLabels[documentType] || "Document";
  const preview = `${typeLabel} ${documentNumber} from ${organizationName}`;

  return (
    <EmailLayout preview={preview}>
      <Section style={content}>
        {/* Greeting */}
        <Text style={greeting}>Hi {contactName},</Text>

        {/* Personal message from the sender */}
        {personalMessage && (
          <Text style={messageText}>{personalMessage}</Text>
        )}

        {/* Document summary card */}
        <table cellPadding="0" cellSpacing="0" role="presentation" style={{ width: "100%" }}>
          <tr>
            <td style={cardOuter}>
              <div style={card}>
                {/* Document header */}
                <table cellPadding="0" cellSpacing="0" role="presentation" style={{ width: "100%" }}>
                  <tr>
                    <td>
                      <Text style={cardLabel}>{typeLabel}</Text>
                      <Text style={cardNumber}>{documentNumber}</Text>
                    </td>
                    <td style={{ textAlign: "right", verticalAlign: "top" }}>
                      <Text style={fromLabel}>From</Text>
                      <Text style={fromName}>{organizationName}</Text>
                    </td>
                  </tr>
                </table>

                {/* Divider */}
                <div style={cardDivider} />

                {/* Document details */}
                <table cellPadding="0" cellSpacing="0" role="presentation" style={{ width: "100%" }}>
                  <tr>
                    {amountFormatted && (
                      <td style={detailCell}>
                        <Text style={detailLabel}>
                          {documentType === "quote" ? "Total" : "Amount Due"}
                        </Text>
                        <Text style={detailValue}>{amountFormatted}</Text>
                      </td>
                    )}
                    {issueDateFormatted && (
                      <td style={detailCell}>
                        <Text style={detailLabel}>
                          {documentType === "quote" ? "Valid Until" : "Issue Date"}
                        </Text>
                        <Text style={detailValue}>{issueDateFormatted}</Text>
                      </td>
                    )}
                    {dueDateFormatted && documentType !== "quote" && (
                      <td style={detailCell}>
                        <Text style={detailLabel}>Due Date</Text>
                        <Text style={detailValue}>{dueDateFormatted}</Text>
                      </td>
                    )}
                  </tr>
                </table>
              </div>
            </td>
          </tr>
        </table>

        {/* CTA Button */}
        {viewUrl && (
          <Section style={buttonSection}>
            <Button style={button} href={viewUrl}>
              View {typeLabel}
            </Button>
          </Section>
        )}

        <Hr style={hr} />

        <Text style={signoff}>
          Thanks,{"\n"}{organizationName}
        </Text>
      </Section>
    </EmailLayout>
  );
}

export default DocumentSentEmail;

const content: React.CSSProperties = { padding: "24px 40px 32px" };

const greeting: React.CSSProperties = {
  fontSize: "16px",
  fontWeight: 600,
  color: "#111827",
  margin: "0 0 12px",
};

const messageText: React.CSSProperties = {
  fontSize: "15px",
  color: "#374151",
  lineHeight: "24px",
  margin: "0 0 24px",
  whiteSpace: "pre-wrap",
};

const cardOuter: React.CSSProperties = {
  paddingBottom: "24px",
};

const card: React.CSSProperties = {
  backgroundColor: "#f9fafb",
  borderRadius: "10px",
  padding: "20px 24px",
  border: "1px solid #e5e7eb",
};

const cardLabel: React.CSSProperties = {
  fontSize: "11px",
  fontWeight: 600,
  color: "#9ca3af",
  textTransform: "uppercase",
  letterSpacing: "0.5px",
  margin: "0 0 2px",
};

const cardNumber: React.CSSProperties = {
  fontSize: "18px",
  fontWeight: 700,
  color: "#111827",
  margin: 0,
};

const fromLabel: React.CSSProperties = {
  fontSize: "11px",
  fontWeight: 600,
  color: "#9ca3af",
  textTransform: "uppercase",
  letterSpacing: "0.5px",
  margin: "0 0 2px",
  textAlign: "right" as const,
};

const fromName: React.CSSProperties = {
  fontSize: "14px",
  fontWeight: 600,
  color: "#374151",
  margin: 0,
  textAlign: "right" as const,
};

const cardDivider: React.CSSProperties = {
  height: "1px",
  backgroundColor: "#e5e7eb",
  margin: "14px 0",
};

const detailCell: React.CSSProperties = {
  verticalAlign: "top",
  paddingRight: "16px",
};

const detailLabel: React.CSSProperties = {
  fontSize: "11px",
  fontWeight: 600,
  color: "#9ca3af",
  textTransform: "uppercase",
  letterSpacing: "0.5px",
  margin: "0 0 2px",
};

const detailValue: React.CSSProperties = {
  fontSize: "15px",
  fontWeight: 700,
  color: "#111827",
  margin: 0,
  fontFamily: "monospace",
};

const buttonSection: React.CSSProperties = {
  textAlign: "center" as const,
  marginBottom: "24px",
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

const hr: React.CSSProperties = {
  borderColor: "#e5e7eb",
  margin: "0 0 16px",
};

const signoff: React.CSSProperties = {
  fontSize: "14px",
  color: "#6b7280",
  lineHeight: "20px",
  margin: 0,
  whiteSpace: "pre-wrap",
};
