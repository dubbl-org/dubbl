import {
  Section,
  Text,
  Button,
} from "@react-email/components";
import * as React from "react";
import { EmailLayout } from "./layout";

interface MemberInviteEmailProps {
  inviterName: string;
  orgName: string;
  role: string;
  loginUrl?: string;
}

export function MemberInviteEmail({
  inviterName = "Someone",
  orgName = "an organization",
  role = "member",
  loginUrl = "https://dubbl.dev/sign-in",
}: MemberInviteEmailProps) {
  return (
    <EmailLayout preview={`You've been invited to ${orgName}`}>
      <Section style={content}>
        <Text style={heading}>You&apos;re invited to join {orgName}</Text>
        <Text style={subtext}>
          {inviterName} has invited you to join <strong>{orgName}</strong> as a{" "}
          <strong>{role}</strong>. Accept the invitation below to get started.
        </Text>

        <table cellPadding="0" cellSpacing="0" role="presentation" style={infoTable}>
          <tr>
            <td style={infoRow}>
              <Text style={infoLabel}>Organization</Text>
              <Text style={infoValue}>{orgName}</Text>
            </td>
          </tr>
          <tr>
            <td style={infoRow}>
              <Text style={infoLabel}>Your role</Text>
              <Text style={infoValue}>{role}</Text>
            </td>
          </tr>
          <tr>
            <td style={{ ...infoRow, borderBottom: "none", paddingBottom: 0 }}>
              <Text style={infoLabel}>Invited by</Text>
              <Text style={infoValue}>{inviterName}</Text>
            </td>
          </tr>
        </table>

        <Section style={buttonSection}>
          <Button style={button} href={loginUrl}>
            Accept Invitation
          </Button>
        </Section>
      </Section>
    </EmailLayout>
  );
}

export default MemberInviteEmail;

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
const infoTable: React.CSSProperties = {
  width: "100%",
  backgroundColor: "#f9fafb",
  borderRadius: "8px",
};
const infoRow: React.CSSProperties = {
  padding: "12px 18px",
  borderBottom: "1px solid #f3f4f6",
};
const infoLabel: React.CSSProperties = {
  fontSize: "11px",
  fontWeight: 600,
  color: "#9ca3af",
  textTransform: "uppercase" as const,
  letterSpacing: "0.5px",
  margin: "0 0 1px",
};
const infoValue: React.CSSProperties = {
  fontSize: "14px",
  color: "#111827",
  fontWeight: 500,
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
