import {
  Section,
  Text,
  Button,
} from "@react-email/components";
import * as React from "react";
import { EmailLayout } from "./layout";

interface InvoiceReminderProps {
  contactName: string;
  documentNumber: string;
  amountDue: string;
  dueDate: string;
  organizationName: string;
  daysOverdue: number;
  viewUrl?: string;
}

export function InvoiceReminderEmail({
  contactName = "John Doe",
  documentNumber = "INV-001",
  amountDue = "$1,250.00",
  dueDate = "Mar 15, 2026",
  organizationName = "Acme Corp",
  daysOverdue = 5,
  viewUrl,
}: InvoiceReminderProps) {
  const isOverdue = daysOverdue > 0;
  const subject = isOverdue
    ? `Invoice ${documentNumber} is ${daysOverdue} day${daysOverdue !== 1 ? "s" : ""} overdue`
    : `Reminder: Invoice ${documentNumber} is due ${dueDate}`;

  return (
    <EmailLayout preview={subject}>
      <Section style={content}>
        <Text style={heading}>
          {isOverdue ? "Payment Overdue" : "Payment Reminder"}
        </Text>
        <Text style={paragraph}>
          Hi {contactName},
        </Text>
        <Text style={paragraph}>
          {isOverdue
            ? `This is a reminder that invoice ${documentNumber} for ${amountDue} was due on ${dueDate} and is now ${daysOverdue} day${daysOverdue !== 1 ? "s" : ""} past due.`
            : `This is a friendly reminder that invoice ${documentNumber} for ${amountDue} is due on ${dueDate}.`}
        </Text>

        <Section style={detailsBox}>
          <Text style={detailRow}>
            <span style={detailLabel}>Invoice</span>
            <span style={detailValue}>{documentNumber}</span>
          </Text>
          <Text style={detailRow}>
            <span style={detailLabel}>Amount Due</span>
            <span style={detailValue}>{amountDue}</span>
          </Text>
          <Text style={detailRow}>
            <span style={detailLabel}>Due Date</span>
            <span style={detailValue}>{dueDate}</span>
          </Text>
        </Section>

        {viewUrl && (
          <Section style={buttonSection}>
            <Button style={button} href={viewUrl}>
              View Invoice
            </Button>
          </Section>
        )}

        <Text style={paragraph}>
          If you have already made this payment, please disregard this message.
        </Text>
        <Text style={signoff}>
          Best regards,
          <br />
          {organizationName}
        </Text>
      </Section>
    </EmailLayout>
  );
}

export default InvoiceReminderEmail;

const content: React.CSSProperties = {
  padding: "24px 32px",
};

const heading: React.CSSProperties = {
  fontSize: "18px",
  fontWeight: 600,
  color: "#111",
  margin: "0 0 16px",
};

const paragraph: React.CSSProperties = {
  fontSize: "14px",
  lineHeight: "24px",
  color: "#333",
  margin: "0 0 12px",
};

const detailsBox: React.CSSProperties = {
  backgroundColor: "#f6f9fc",
  borderRadius: "6px",
  padding: "16px 20px",
  margin: "16px 0",
};

const detailRow: React.CSSProperties = {
  fontSize: "13px",
  lineHeight: "24px",
  color: "#333",
  margin: 0,
};

const detailLabel: React.CSSProperties = {
  color: "#8898aa",
  display: "inline-block",
  width: "120px",
};

const detailValue: React.CSSProperties = {
  fontWeight: 600,
};

const buttonSection: React.CSSProperties = {
  textAlign: "center" as const,
  margin: "24px 0",
};

const button: React.CSSProperties = {
  backgroundColor: "#059669",
  borderRadius: "6px",
  color: "#fff",
  fontSize: "14px",
  fontWeight: 600,
  textDecoration: "none",
  textAlign: "center" as const,
  padding: "10px 24px",
};

const signoff: React.CSSProperties = {
  fontSize: "14px",
  lineHeight: "24px",
  color: "#333",
  margin: "24px 0 0",
};
