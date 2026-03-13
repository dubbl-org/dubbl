import {
  Section,
  Text,
  Button,
} from "@react-email/components";
import * as React from "react";
import { EmailLayout } from "./layout";

interface OrgCreatedEmailProps {
  userName: string;
  orgName: string;
  dashboardUrl?: string;
}

export function OrgCreatedEmail({
  userName = "there",
  orgName = "Your Organization",
  dashboardUrl = "https://dubbl.dev/dashboard",
}: OrgCreatedEmailProps) {
  return (
    <EmailLayout preview={`${orgName} is ready`}>
      <Section style={content}>
        <Text style={heading}>{orgName} is ready to go</Text>
        <Text style={subtext}>
          Nice one, {userName}. Your organization has been created. Here are a
          few things to do next.
        </Text>

        <table cellPadding="0" cellSpacing="0" role="presentation" style={{ width: "100%" }}>
          {[
            {
              num: "1",
              title: "Set up your business info",
              desc: "Add your company details, address, and tax information so your invoices and reports are accurate.",
            },
            {
              num: "2",
              title: "Invite team members",
              desc: "Bring your team on board. Assign roles like admin or member to control what they can access.",
            },
            {
              num: "3",
              title: "Connect your bank account",
              desc: "Link your bank to automatically import transactions and keep your books up to date.",
            },
          ].map((step) => (
            <tr key={step.num}>
              <td style={stepCell}>
                <table cellPadding="0" cellSpacing="0" role="presentation" style={{ width: "100%" }}>
                  <tr>
                    <td style={stepNumCell}>
                      <div style={stepNumBadge}>{step.num}</div>
                    </td>
                    <td style={stepContentCell}>
                      <Text style={stepTitle}>{step.title}</Text>
                      <Text style={stepDesc}>{step.desc}</Text>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          ))}
        </table>

        <Section style={buttonSection}>
          <Button style={button} href={dashboardUrl}>
            Set Up Your Organization
          </Button>
        </Section>
      </Section>
    </EmailLayout>
  );
}

export default OrgCreatedEmail;

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
const stepCell: React.CSSProperties = {
  paddingBottom: "12px",
};
const stepNumCell: React.CSSProperties = {
  verticalAlign: "top",
  width: "36px",
  paddingTop: "2px",
};
const stepNumBadge: React.CSSProperties = {
  width: "24px",
  height: "24px",
  lineHeight: "24px",
  borderRadius: "50%",
  backgroundColor: "#059669",
  color: "#ffffff",
  fontSize: "12px",
  fontWeight: 700,
  textAlign: "center" as const,
};
const stepContentCell: React.CSSProperties = {
  verticalAlign: "top",
};
const stepTitle: React.CSSProperties = {
  fontSize: "14px",
  fontWeight: 600,
  color: "#111827",
  margin: "0 0 2px",
};
const stepDesc: React.CSSProperties = {
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
