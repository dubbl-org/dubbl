import {
  Section,
  Text,
  Button,
} from "@react-email/components";
import * as React from "react";
import { EmailLayout } from "./layout";

interface DigestNotification {
  type: string;
  title: string;
  body?: string | null;
  createdAt: string;
}

interface NotificationDigestProps {
  userName: string;
  orgName: string;
  notifications: DigestNotification[];
  dashboardUrl?: string;
  unsubscribeUrl?: string;
}

const TYPE_COLOR: Record<string, string> = {
  invoice_overdue: "#ef4444",
  payment_received: "#10b981",
  inventory_low: "#f59e0b",
  payroll_due: "#6366f1",
  approval_needed: "#8b5cf6",
  system_alert: "#f97316",
  task_assigned: "#3b82f6",
};

export function NotificationDigestEmail({
  userName = "there",
  orgName = "Acme Corp",
  notifications = [],
  dashboardUrl = "https://dubbl.dev/notifications",
  unsubscribeUrl,
}: NotificationDigestProps) {
  const MAX_SHOWN = 9;
  const count = notifications.length;
  const shown = notifications.slice(0, MAX_SHOWN);
  const remaining = count - shown.length;
  const preview = `You have ${count} new notification${count !== 1 ? "s" : ""} on dubbl`;

  return (
    <EmailLayout preview={preview} unsubscribeUrl={unsubscribeUrl}>
      <Section style={content}>
        <Text style={heading}>
          {count} new notification{count !== 1 ? "s" : ""}
        </Text>
        <Text style={subtext}>
          Hi {userName}, here is a summary of recent activity on {orgName}.
        </Text>

        <table cellPadding="0" cellSpacing="0" role="presentation" style={{ width: "100%" }}>
          {shown.map((n, i) => (
            <tr key={i}>
              <td style={{
                padding: "12px 0",
                borderTop: i > 0 ? "1px solid #f3f4f6" : "none",
              }}>
                <table cellPadding="0" cellSpacing="0" role="presentation" style={{ width: "100%" }}>
                  <tr>
                    <td style={{ width: "20px", verticalAlign: "top", paddingTop: "4px" }}>
                      <div style={{
                        width: "8px",
                        height: "8px",
                        borderRadius: "50%",
                        backgroundColor: TYPE_COLOR[n.type] || "#9ca3af",
                      }} />
                    </td>
                    <td style={{ verticalAlign: "top" }}>
                      <Text style={notifTitle}>{n.title}</Text>
                      {n.body && <Text style={notifBody}>{n.body}</Text>}
                      <Text style={notifTime}>{n.createdAt}</Text>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          ))}
        </table>

        {remaining > 0 && (
          <Text style={moreText}>
            +{remaining} more notification{remaining !== 1 ? "s" : ""}
          </Text>
        )}

        <Section style={buttonSection}>
          <Button style={button} href={dashboardUrl}>
            View in Dashboard
          </Button>
        </Section>
      </Section>
    </EmailLayout>
  );
}

export default NotificationDigestEmail;

const content: React.CSSProperties = { padding: "24px 40px 32px" };
const heading: React.CSSProperties = { fontSize: "22px", fontWeight: 700, color: "#111827", margin: "0 0 8px" };
const subtext: React.CSSProperties = { fontSize: "15px", color: "#4b5563", lineHeight: "24px", margin: "0 0 24px" };
const moreText: React.CSSProperties = { fontSize: "13px", fontWeight: 500, color: "#9ca3af", textAlign: "center" as const, margin: "16px 0 0", borderTop: "1px solid #f3f4f6", paddingTop: "14px" };
const notifTitle: React.CSSProperties = { fontSize: "14px", fontWeight: 600, color: "#111827", margin: "0 0 2px" };
const notifBody: React.CSSProperties = { fontSize: "13px", color: "#6b7280", margin: "0 0 4px", lineHeight: "20px" };
const notifTime: React.CSSProperties = { fontSize: "11px", color: "#9ca3af", margin: 0 };
const buttonSection: React.CSSProperties = { textAlign: "center" as const, margin: "24px 0 0" };
const button: React.CSSProperties = { backgroundColor: "#059669", borderRadius: "8px", color: "#fff", fontSize: "14px", fontWeight: 600, textDecoration: "none", textAlign: "center" as const, padding: "12px 32px" };
