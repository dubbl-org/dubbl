import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { invoice } from "@/lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { stripe } from "@/lib/stripe";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const inv = await db.query.invoice.findFirst({
    where: and(
      eq(invoice.paymentLinkToken, token),
      isNull(invoice.deletedAt)
    ),
    with: { organization: true },
  });

  if (!inv || inv.status === "paid" || inv.status === "void" || inv.status === "draft") {
    return NextResponse.json({ error: "Invoice not payable" }, { status: 400 });
  }

  const url = new URL(request.url);
  const baseUrl = `${url.protocol}//${url.host}`;

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    line_items: [
      {
        price_data: {
          currency: inv.currencyCode.toLowerCase(),
          product_data: {
            name: `Invoice ${inv.invoiceNumber}`,
            description: `Payment to ${inv.organization.name}`,
          },
          unit_amount: inv.amountDue,
        },
        quantity: 1,
      },
    ],
    metadata: {
      invoiceId: inv.id,
      organizationId: inv.organizationId,
      paymentLinkToken: token,
    },
    success_url: `${baseUrl}/pay/${token}?status=success`,
    cancel_url: `${baseUrl}/pay/${token}?status=cancelled`,
  });

  return NextResponse.json({ checkoutUrl: session.url });
}
