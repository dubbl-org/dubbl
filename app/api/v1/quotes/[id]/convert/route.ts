import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { quote, invoice, invoiceLine, contact, organization } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { getNextNumber } from "@/lib/api/numbering";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:invoices");

    const found = await db.query.quote.findFirst({
      where: and(
        eq(quote.id, id),
        eq(quote.organizationId, ctx.organizationId),
        notDeleted(quote.deletedAt)
      ),
      with: { lines: true },
    });

    if (!found) return notFound("Quote");
    if (found.status !== "accepted") {
      return NextResponse.json(
        { error: "Only accepted quotes can be converted to invoices" },
        { status: 400 }
      );
    }

    const invoiceNumber = await getNextNumber(ctx.organizationId, "invoice", "invoice_number", "INV");

    // Calculate due date from contact payment terms
    const today = new Date().toISOString().split("T")[0];
    const contactRecord = await db.query.contact.findFirst({
      where: eq(contact.id, found.contactId),
      columns: { paymentTermsDays: true },
    });
    let termsDays = contactRecord?.paymentTermsDays;
    if (termsDays == null) {
      const org = await db.query.organization.findFirst({
        where: eq(organization.id, ctx.organizationId),
        columns: { defaultPaymentTerms: true },
      });
      termsDays = org?.defaultPaymentTerms ? parseInt(org.defaultPaymentTerms) : 30;
    }
    const dueDateObj = new Date(today + "T00:00:00Z");
    dueDateObj.setUTCDate(dueDateObj.getUTCDate() + (termsDays || 30));
    const dueDate = dueDateObj.toISOString().split("T")[0];

    // Create invoice from quote
    const [createdInvoice] = await db
      .insert(invoice)
      .values({
        organizationId: ctx.organizationId,
        contactId: found.contactId,
        invoiceNumber,
        issueDate: today,
        dueDate,
        reference: found.reference,
        notes: found.notes,
        subtotal: found.subtotal,
        taxTotal: found.taxTotal,
        total: found.total,
        amountPaid: 0,
        amountDue: found.total,
        currencyCode: found.currencyCode,
        createdBy: ctx.userId,
      })
      .returning();

    // Copy quote lines to invoice lines
    if (found.lines.length > 0) {
      await db.insert(invoiceLine).values(
        found.lines.map((l) => ({
          invoiceId: createdInvoice.id,
          description: l.description,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          accountId: l.accountId,
          taxRateId: l.taxRateId,
          discountPercent: l.discountPercent,
          taxAmount: l.taxAmount,
          amount: l.amount,
          sortOrder: l.sortOrder,
        }))
      );
    }

    // Mark quote as converted
    const [updated] = await db
      .update(quote)
      .set({
        status: "converted",
        convertedInvoiceId: createdInvoice.id,
        updatedAt: new Date(),
      })
      .where(eq(quote.id, id))
      .returning();

    return NextResponse.json({ quote: updated, invoice: createdInvoice });
  } catch (err) {
    return handleError(err);
  }
}
