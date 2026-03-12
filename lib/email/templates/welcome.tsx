import {
  Section,
  Text,
  Button,
} from "@react-email/components";
import * as React from "react";
import { EmailLayout } from "./layout";

interface WelcomeEmailProps {
  userName: string;
  dashboardUrl?: string;
}

export function WelcomeEmail({
  userName = "there",
  dashboardUrl = "https://app.dubbl.dev",
}: WelcomeEmailProps) {
  return (
    <EmailLayout preview="Welcome to dubbl">
      <Section style={content}>
        <Text style={heading}>Welcome to dubbl</Text>
        <Text style={paragraph}>
          Hi {userName},
        </Text>
        <Text style={paragraph}>
          Your account is ready. dubbl gives you everything you need to manage
          your accounting, invoicing, and payroll in one place.
        </Text>
        <Text style={paragraph}>
          Here are a few things you can do to get started:
        </Text>
        <Section style={listSection}>
          <Text style={listItem}>Set up your chart of accounts</Text>
          <Text style={listItem}>Add your contacts and start invoicing</Text>
          <Text style={listItem}>Connect your bank account for reconciliation</Text>
          <Text style={listItem}>Invite your team members</Text>
        </Section>
        <Section style={buttonSection}>
          <Button style={button} href={dashboardUrl}>
            Go to Dashboard
          </Button>
        </Section>
        <Text style={paragraph}>
          If you have any questions, just reply to this email.
        </Text>
      </Section>
    </EmailLayout>
  );
}

export default WelcomeEmail;

const content: React.CSSProperties = { padding: "24px 32px" };
const heading: React.CSSProperties = { fontSize: "18px", fontWeight: 600, color: "#111", margin: "0 0 16px" };
const paragraph: React.CSSProperties = { fontSize: "14px", lineHeight: "24px", color: "#333", margin: "0 0 12px" };
const listSection: React.CSSProperties = { margin: "8px 0 16px" };
const listItem: React.CSSProperties = { fontSize: "14px", lineHeight: "28px", color: "#333", margin: 0, paddingLeft: "16px" };
const buttonSection: React.CSSProperties = { textAlign: "center" as const, margin: "24px 0" };
const button: React.CSSProperties = { backgroundColor: "#059669", borderRadius: "6px", color: "#fff", fontSize: "14px", fontWeight: 600, textDecoration: "none", textAlign: "center" as const, padding: "10px 24px" };
