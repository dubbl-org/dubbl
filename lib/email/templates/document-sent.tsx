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
  buttonLabel?: string;
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
  buttonLabel,
}: DocumentSentEmailProps) {
  const typeLabel = documentTypeLabels[documentType] || "Document";
  const preview = `${typeLabel} ${documentNumber} from ${organizationName}`;

  const amountLabel = documentType === "quote" ? "Total" : "Amount due";
  const dateLabel = documentType === "quote" ? "Valid until" : "Due date";

  return (
    <EmailLayout preview={preview}>
      <Section style={content}>
        <Text style={heading}>
          {organizationName} sent you {typeLabel.toLowerCase()} {documentNumber}
        </Text>

        {personalMessage && (
          <Text style={message}>{personalMessage}</Text>
        )}

        {amountFormatted && (
          <>
            <Text style={label}>{amountLabel}</Text>
            <Text style={amount}>{amountFormatted}</Text>
          </>
        )}

        {(issueDateFormatted || dueDateFormatted) && (
          <table cellPadding="0" cellSpacing="0" role="presentation" style={{ width: "100%", marginTop: "16px" }}>
            <tr>
              {issueDateFormatted && (
                <td>
                  <Text style={metaLabel}>Issued</Text>
                  <Text style={metaValue}>{issueDateFormatted}</Text>
                </td>
              )}
              {dueDateFormatted && documentType !== "quote" && (
                <td>
                  <Text style={metaLabel}>{dateLabel}</Text>
                  <Text style={metaValue}>{dueDateFormatted}</Text>
                </td>
              )}
              {dueDateFormatted && documentType === "quote" && (
                <td>
                  <Text style={metaLabel}>{dateLabel}</Text>
                  <Text style={metaValue}>{dueDateFormatted}</Text>
                </td>
              )}
            </tr>
          </table>
        )}

        {viewUrl && (
          <Section style={buttonWrap}>
            <Button style={button} href={viewUrl}>
              {buttonLabel || `View ${typeLabel.toLowerCase()}`}
            </Button>
          </Section>
        )}

        <Hr style={hr} />

        <Text style={footer}>
          {organizationName}
        </Text>
      </Section>
    </EmailLayout>
  );
}

export default DocumentSentEmail;

const content: React.CSSProperties = {
  padding: "32px 40px 36px",
};

const heading: React.CSSProperties = {
  fontSize: "16px",
  color: "#1a1a1a",
  lineHeight: "24px",
  margin: "0 0 20px",
  fontWeight: 400,
};

const message: React.CSSProperties = {
  fontSize: "14px",
  color: "#525f7f",
  lineHeight: "22px",
  margin: "0 0 24px",
  whiteSpace: "pre-wrap",
};

const label: React.CSSProperties = {
  fontSize: "13px",
  color: "#8898aa",
  margin: "0 0 4px",
  fontWeight: 400,
};

const amount: React.CSSProperties = {
  fontSize: "28px",
  fontWeight: 600,
  color: "#1a1a1a",
  margin: "0 0 4px",
  letterSpacing: "-0.5px",
};

const metaLabel: React.CSSProperties = {
  fontSize: "13px",
  color: "#8898aa",
  margin: "0 0 2px",
  fontWeight: 400,
};

const metaValue: React.CSSProperties = {
  fontSize: "14px",
  color: "#1a1a1a",
  margin: 0,
  fontWeight: 500,
};

const buttonWrap: React.CSSProperties = {
  marginTop: "28px",
  marginBottom: "4px",
};

const button: React.CSSProperties = {
  backgroundColor: "#1a1a1a",
  borderRadius: "6px",
  color: "#fff",
  fontSize: "14px",
  fontWeight: 500,
  textDecoration: "none",
  textAlign: "center" as const,
  padding: "10px 24px",
  display: "inline-block",
};

const hr: React.CSSProperties = {
  borderColor: "#e6ebf1",
  margin: "28px 0 16px",
};

const footer: React.CSSProperties = {
  fontSize: "13px",
  color: "#8898aa",
  margin: 0,
};
