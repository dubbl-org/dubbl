import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { invoice } from "@/lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { stripe } from "@/lib/stripe";
import { rateLimit, clientIp } from "@/lib/api/rate-limit";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  if (!stripe) {
    return NextResponse.json({ error: "Billing not configured" }, { status: 404 });
  }

  const { token } = await params;

  if (!rateLimit(`pay-checkout:${clientIp(request)}`, 20)) {
    return NextResponse.json({ error: "Too many attempts, try again later" }, { status: 429 });
  }

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
    automatic_tax: { enabled: true },
    // stripe v23: payment_method_types was removed; filter card via the
    // dynamically eligible set instead
    allowed_payment_method_types: ["card"],
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
