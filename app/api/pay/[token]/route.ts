import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { invoice } from "@/lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const inv = await db.query.invoice.findFirst({
    where: and(
      eq(invoice.paymentLinkToken, token),
      isNull(invoice.deletedAt)
    ),
    with: {
      organization: true,
      contact: true,
      lines: true,
    },
  });

  if (!inv) {
    return NextResponse.json({ error: "Invalid payment link" }, { status: 404 });
  }

  if (inv.status === "paid") {
    return NextResponse.json({ status: "paid", invoice: { invoiceNumber: inv.invoiceNumber } });
  }

  if (inv.status === "void" || inv.status === "draft") {
    return NextResponse.json({ error: "Invoice is not payable" }, { status: 400 });
  }

  return NextResponse.json({
    status: "pending",
    invoice: {
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      issueDate: inv.issueDate,
      dueDate: inv.dueDate,
      total: inv.total,
      amountDue: inv.amountDue,
      currencyCode: inv.currencyCode,
      lines: inv.lines.map((l) => ({
        description: l.description,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        amount: l.amount,
        taxAmount: l.taxAmount,
      })),
    },
    organization: {
      name: inv.organization.name,
    },
    contact: {
      name: inv.contact?.name,
    },
  });
}
