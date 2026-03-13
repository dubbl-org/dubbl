import {
  Section,
  Text,
  Button,
} from "@react-email/components";
import * as React from "react";
import { EmailLayout } from "./layout";

interface LoginAlertEmailProps {
  userName: string;
  ipAddress: string;
  userAgent?: string;
  provider: string;
  timestamp: string;
  securityUrl?: string;
}

export function LoginAlertEmail({
  userName = "there",
  ipAddress = "Unknown",
  userAgent = "Unknown browser",
  provider = "credentials",
  timestamp = new Date().toLocaleString(),
  securityUrl = "https://dubbl.dev/settings",
}: LoginAlertEmailProps) {
  return (
    <EmailLayout preview={`New sign-in from ${ipAddress}`}>
      <Section style={content}>
        <Text style={heading}>New sign-in detected</Text>
        <Text style={subtext}>
          Hi {userName}, we noticed a sign-in to your dubbl account from an IP
          address we have not seen before. If this was you, no action is needed.
        </Text>

        <div style={detailsCard}>
          <table cellPadding="0" cellSpacing="0" role="presentation" style={{ width: "100%" }}>
            <tr>
              <td style={detailLabel}>IP Address</td>
              <td style={detailValue}>{ipAddress}</td>
            </tr>
            <tr>
              <td style={detailLabel}>Browser</td>
              <td style={detailValue}>{userAgent}</td>
            </tr>
            <tr>
              <td style={detailLabel}>Method</td>
              <td style={detailValue}>{provider}</td>
            </tr>
            <tr>
              <td style={detailLabel}>Time</td>
              <td style={detailValue}>{timestamp}</td>
            </tr>
          </table>
        </div>

        <Text style={warningText}>
          If you did not sign in, please change your password immediately and
          review your account activity.
        </Text>

        <Section style={buttonSection}>
          <Button style={button} href={securityUrl}>
            Review Account
          </Button>
        </Section>
      </Section>
    </EmailLayout>
  );
}

export default LoginAlertEmail;

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
const detailsCard: React.CSSProperties = {
  backgroundColor: "#fef2f2",
  borderRadius: "8px",
  padding: "16px 20px",
  marginBottom: "20px",
  border: "1px solid #fecaca",
};
const detailLabel: React.CSSProperties = {
  fontSize: "13px",
  fontWeight: 600,
  color: "#6b7280",
  padding: "4px 16px 4px 0",
  verticalAlign: "top",
  whiteSpace: "nowrap",
};
const detailValue: React.CSSProperties = {
  fontSize: "13px",
  color: "#111827",
  padding: "4px 0",
  verticalAlign: "top",
  wordBreak: "break-all",
};
const warningText: React.CSSProperties = {
  fontSize: "14px",
  color: "#dc2626",
  lineHeight: "22px",
  margin: "0 0 16px",
  fontWeight: 500,
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
