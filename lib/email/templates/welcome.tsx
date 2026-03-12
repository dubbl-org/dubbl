import {
  Section,
  Text,
  Button,
} from "@react-email/components";
import * as React from "react";
import { EmailLayout } from "./layout";

interface WelcomeEmailProps {
  userName: string;
  loginUrl?: string;
}

export function WelcomeEmail({
  userName = "there",
  loginUrl = "https://dubbl.dev/sign-in",
}: WelcomeEmailProps) {
  return (
    <EmailLayout preview="Welcome to dubbl">
      <Section style={content}>
        <Text style={heading}>Welcome to dubbl, {userName}</Text>
        <Text style={subtext}>
          You now have access to everything you need to manage your business
          finances. Invoicing, double-entry accounting, team management, and
          more.
        </Text>

        <table cellPadding="0" cellSpacing="0" role="presentation" style={{ width: "100%" }}>
          <tr>
            <td style={featureCell}>
              <div style={featureCard}>
                <Text style={featureTitle}>Invoicing</Text>
                <Text style={featureDesc}>
                  Create and send professional invoices. Track payments and manage your cash flow.
                </Text>
              </div>
            </td>
          </tr>
          <tr>
            <td style={featureCell}>
              <div style={featureCard}>
                <Text style={featureTitle}>Accounting</Text>
                <Text style={featureDesc}>
                  Double-entry bookkeeping with automated reports and real-time financial insights.
                </Text>
              </div>
            </td>
          </tr>
          <tr>
            <td style={featureCell}>
              <div style={featureCard}>
                <Text style={featureTitle}>Team Management</Text>
                <Text style={featureDesc}>
                  Invite your team, assign roles, and collaborate on your finances with full control.
                </Text>
              </div>
            </td>
          </tr>
        </table>

        <Section style={buttonSection}>
          <Button style={button} href={loginUrl}>
            Go to Dashboard
          </Button>
        </Section>
      </Section>
    </EmailLayout>
  );
}

export default WelcomeEmail;

const content: React.CSSProperties = { padding: "24px 40px 32px" };
const heading: React.CSSProperties = {
  fontSize: "22px",
  fontWeight: 700,
  color: "#111827",
  margin: "0 0 8px",
};
const subtext: React.CSSProperties = {
  fontSize: "15px",
  color: "#4b5563",
  lineHeight: "24px",
  margin: "0 0 24px",
};
const featureCell: React.CSSProperties = {
  paddingBottom: "8px",
};
const featureCard: React.CSSProperties = {
  backgroundColor: "#f9fafb",
  borderRadius: "8px",
  padding: "14px 18px",
};
const featureTitle: React.CSSProperties = {
  fontSize: "14px",
  fontWeight: 600,
  color: "#111827",
  margin: "0 0 2px",
};
const featureDesc: React.CSSProperties = {
  fontSize: "13px",
  color: "#6b7280",
  lineHeight: "20px",
  margin: 0,
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
