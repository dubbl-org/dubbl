import {
  Section,
  Text,
  Button,
  Hr,
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

const TYPE_EMOJI: Record<string, string> = {
  invoice_overdue: "📄",
  payment_received: "💰",
  inventory_low: "📦",
  payroll_due: "🏦",
  approval_needed: "🔐",
  system_alert: "⚠️",
  task_assigned: "📋",
};

export function NotificationDigestEmail({
  userName = "there",
  orgName = "Acme Corp",
  notifications = [],
  dashboardUrl = "https://app.dubbl.dev/notifications",
  unsubscribeUrl,
}: NotificationDigestProps) {
  const count = notifications.length;
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

        {notifications.map((n, i) => (
          <React.Fragment key={i}>
            {i > 0 && <Hr style={divider} />}
            <Section style={notifRow}>
              <Text style={notifIcon}>{TYPE_EMOJI[n.type] || "🔔"}</Text>
              <Section style={notifContent}>
                <Text style={notifTitle}>{n.title}</Text>
                {n.body && <Text style={notifBody}>{n.body}</Text>}
                <Text style={notifTime}>{n.createdAt}</Text>
              </Section>
            </Section>
          </React.Fragment>
        ))}

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

const content: React.CSSProperties = { padding: "24px 32px" };
const heading: React.CSSProperties = { fontSize: "18px", fontWeight: 600, color: "#111", margin: "0 0 8px" };
const subtext: React.CSSProperties = { fontSize: "14px", color: "#666", margin: "0 0 24px" };
const divider: React.CSSProperties = { borderColor: "#eee", margin: "0" };
const notifRow: React.CSSProperties = { padding: "12px 0" };
const notifIcon: React.CSSProperties = { fontSize: "16px", margin: 0, display: "inline", verticalAlign: "top" };
const notifContent: React.CSSProperties = { display: "inline-block", marginLeft: "8px", verticalAlign: "top" };
const notifTitle: React.CSSProperties = { fontSize: "14px", fontWeight: 600, color: "#111", margin: "0 0 2px" };
const notifBody: React.CSSProperties = { fontSize: "13px", color: "#555", margin: "0 0 4px", lineHeight: "20px" };
const notifTime: React.CSSProperties = { fontSize: "11px", color: "#999", margin: 0 };
const buttonSection: React.CSSProperties = { textAlign: "center" as const, margin: "24px 0 0" };
const button: React.CSSProperties = { backgroundColor: "#059669", borderRadius: "6px", color: "#fff", fontSize: "14px", fontWeight: 600, textDecoration: "none", textAlign: "center" as const, padding: "10px 24px" };
