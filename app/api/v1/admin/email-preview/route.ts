import { NextResponse } from "next/server";
import { handleError } from "@/lib/api/response";
import { requireSiteAdmin } from "@/lib/api/require-site-admin";
import { render } from "@react-email/render";
import { createElement } from "react";
import { NotificationDigestEmail } from "@/lib/email/templates/notification-digest";
import { WelcomeEmail } from "@/lib/email/templates/welcome";
import { OrgCreatedEmail } from "@/lib/email/templates/org-created";
import { MemberInviteEmail } from "@/lib/email/templates/member-invite";

const TEMPLATES: Record<string, { name: string; component: () => React.ReactElement }> = {
  "notification-digest": {
    name: "Notification Digest",
    component: () =>
      createElement(NotificationDigestEmail, {
        userName: "John",
        orgName: "Acme Corp",
        notifications: [
          { type: "invoice_overdue", title: "Invoice INV-0042 is overdue", body: "Due date was 5 days ago. Amount: $1,250.00", createdAt: "2h ago" },
          { type: "payment_received", title: "Payment received from Widget Co", body: "$3,500.00 applied to INV-0038", createdAt: "4h ago" },
          { type: "approval_needed", title: "Expense report needs approval", body: "Sarah submitted $420.00 in travel expenses", createdAt: "6h ago" },
          { type: "task_assigned", title: "New task: Review Q1 financials", body: null, createdAt: "7h ago" },
          { type: "payment_received", title: "Payment received from TechStart", body: "$8,200.00 applied to INV-0041", createdAt: "8h ago" },
          { type: "inventory_low", title: "Low stock: Premium Widget (12 left)", body: "Reorder point is 20 units", createdAt: "9h ago" },
          { type: "invoice_overdue", title: "Invoice INV-0039 is overdue", body: "Due date was 2 days ago. Amount: $750.00", createdAt: "10h ago" },
          { type: "system_alert", title: "Bank feed sync completed", body: "14 new transactions imported from Barclays", createdAt: "11h ago" },
          { type: "payroll_due", title: "Payroll run due in 3 days", body: "March payroll for 8 employees", createdAt: "12h ago" },
          { type: "payment_received", title: "Payment received from GlobalRetail", body: "$2,100.00 applied to INV-0037", createdAt: "13h ago" },
          { type: "approval_needed", title: "Bill approval: Office supplies", body: "$340.00 from Staples UK", createdAt: "14h ago" },
        ],
        dashboardUrl: "https://dubbl.dev/notifications",
      }),
  },
  welcome: {
    name: "Welcome",
    component: () =>
      createElement(WelcomeEmail, {
        userName: "John",
        loginUrl: "https://dubbl.dev/sign-in",
      }),
  },
  "org-created": {
    name: "Organization Created",
    component: () =>
      createElement(OrgCreatedEmail, {
        userName: "John",
        orgName: "Acme Corp",
        dashboardUrl: "https://dubbl.dev/dashboard",
      }),
  },
  "member-invite": {
    name: "Member Invite",
    component: () =>
      createElement(MemberInviteEmail, {
        inviterName: "Jane Smith",
        orgName: "Acme Corp",
        role: "admin",
        loginUrl: "https://dubbl.dev/sign-in",
      }),
  },
};

export async function GET(request: Request) {
  try {
    const result = await requireSiteAdmin();
    if (result instanceof NextResponse) return result;

    const url = new URL(request.url);
    const templateId = url.searchParams.get("template");

    if (!templateId) {
      return NextResponse.json({
        templates: Object.entries(TEMPLATES).map(([id, t]) => ({ id, name: t.name })),
      });
    }

    const template = TEMPLATES[templateId];
    if (!template) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    const html = await render(template.component());
    return NextResponse.json({ html, name: template.name });
  } catch (err) {
    return handleError(err);
  }
}
