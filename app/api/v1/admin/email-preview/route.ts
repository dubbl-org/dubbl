import { NextResponse } from "next/server";
import { handleError } from "@/lib/api/response";
import { requireSiteAdmin } from "@/lib/api/require-site-admin";
import { render } from "@react-email/render";
import { createElement } from "react";
import { NotificationDigestEmail } from "@/lib/email/templates/notification-digest";

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
        ],
        dashboardUrl: "https://app.dubbl.dev/notifications",
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
