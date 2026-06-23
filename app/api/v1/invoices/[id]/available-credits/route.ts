import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { invoice, customerCredit } from "@/lib/db/schema";
import { eq, and, gt, desc } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError, notFound } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";

/**
 * List the open customer credits (prepayments / deposits / overpayments) that
 * can be applied to THIS invoice. Mirrors the filtering enforced by
 * customer-credits/[id]/apply: the credit must belong to the same contact,
 * match the invoice currency, be status "open", and have a positive remaining
 * balance. Amounts are returned in integer minor units (cents).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);

    const found = await db.query.invoice.findFirst({
      where: and(
        eq(invoice.id, id),
        eq(invoice.organizationId, ctx.organizationId),
        notDeleted(invoice.deletedAt)
      ),
      columns: {
        id: true,
        contactId: true,
        currencyCode: true,
        amountDue: true,
        status: true,
      },
    });

    if (!found) return notFound("Invoice");

    const credits = await db.query.customerCredit.findMany({
      where: and(
        eq(customerCredit.organizationId, ctx.organizationId),
        eq(customerCredit.contactId, found.contactId),
        eq(customerCredit.currencyCode, found.currencyCode),
        eq(customerCredit.status, "open"),
        gt(customerCredit.amountRemaining, 0),
        notDeleted(customerCredit.deletedAt)
      ),
      orderBy: desc(customerCredit.date),
      columns: {
        id: true,
        date: true,
        currencyCode: true,
        originalAmount: true,
        amountRemaining: true,
        sourceType: true,
        notes: true,
      },
    });

    return NextResponse.json({
      credits,
      currencyCode: found.currencyCode,
      amountDue: found.amountDue,
    });
  } catch (err) {
    return handleError(err);
  }
}
