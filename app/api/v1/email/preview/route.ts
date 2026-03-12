import { NextResponse } from "next/server";
import { render } from "@react-email/render";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { InvoiceReminderEmail } from "@/lib/email/templates/invoice-reminder";
import { StatementEmail } from "@/lib/email/templates/statement";
import { WelcomeEmail } from "@/lib/email/templates/welcome";
import { NotificationDigestEmail } from "@/lib/email/templates/notification-digest";
import { createElement } from "react";

const TEMPLATES: Record<string, () => React.ReactElement> = {
  "invoice-reminder": () =>
    createElement(InvoiceReminderEmail, {
      contactName: "Jane Smith",
      documentNumber: "INV-2026-042",
      amountDue: "$1,250.00",
      dueDate: "Mar 15, 2026",
      organizationName: "Acme Corp",
      daysOverdue: 5,
      viewUrl: "https://app.dubbl.dev",
    }),
  statement: () =>
    createElement(StatementEmail, {
      contactName: "Jane Smith",
      organizationName: "Acme Corp",
      startDate: "Jan 1, 2026",
      endDate: "Mar 12, 2026",
      openingBalance: "$0.00",
      closingBalance: "$2,450.00",
      totalDebit: "$3,700.00",
      totalCredit: "$1,250.00",
      transactions: [
        { date: "Jan 15", type: "Invoice", documentNumber: "INV-001", description: "Monthly service", debit: "$1,500.00", credit: "", balance: "$1,500.00" },
        { date: "Feb 1", type: "Payment", documentNumber: "PMT-001", description: "Payment received", debit: "", credit: "$1,250.00", balance: "$250.00" },
        { date: "Mar 1", type: "Invoice", documentNumber: "INV-002", description: "Quarterly retainer", debit: "$2,200.00", credit: "", balance: "$2,450.00" },
      ],
    }),
  welcome: () =>
    createElement(WelcomeEmail, {
      userName: "Jane",
      dashboardUrl: "https://app.dubbl.dev",
    }),
  "notification-digest": () =>
    createElement(NotificationDigestEmail, {
      userName: "Jane",
      orgName: "Acme Corp",
      dashboardUrl: "https://app.dubbl.dev/notifications",
      notifications: [
        { type: "invoice_overdue", title: "Invoice INV-042 is 5 days overdue", body: "Jane Smith owes $1,250.00", createdAt: "2 hours ago" },
        { type: "payment_received", title: "Payment of $3,000.00 received", body: "From Acme Corp for INV-041", createdAt: "3 hours ago" },
        { type: "approval_needed", title: "Bill BIL-019 needs approval", body: "From Supplies Co for $450.00", createdAt: "5 hours ago" },
      ],
    }),
};

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:banking");

    const url = new URL(request.url);
    const template = url.searchParams.get("template");

    if (!template || !TEMPLATES[template]) {
      return NextResponse.json(
        {
          error: "Invalid template. Available: " + Object.keys(TEMPLATES).join(", "),
          available: Object.keys(TEMPLATES),
        },
        { status: 400 }
      );
    }

    const element = TEMPLATES[template]();
    const html = await render(element);

    return new NextResponse(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (err) {
    return handleError(err);
  }
}
