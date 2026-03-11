import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { invoice, invoiceLine, organization } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError, notFound } from "@/lib/api/response";
import { generateUblXml, validateUblData } from "@/lib/ubl/generate-ubl";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getAuthContext(request);
    const { id } = await params;

    const inv = await db.query.invoice.findFirst({
      where: eq(invoice.id, id),
      with: {
        lines: { with: { taxRate: true } },
        contact: true,
      },
    });

    if (!inv || inv.organizationId !== ctx.organizationId) {
      return notFound("Invoice");
    }

    const org = await db.query.organization.findFirst({
      where: eq(organization.id, ctx.organizationId),
    });

    if (!org) return notFound("Organization");

    const ublData = {
      invoiceNumber: inv.invoiceNumber,
      issueDate: inv.issueDate,
      dueDate: inv.dueDate,
      currencyCode: inv.currencyCode,
      supplier: {
        name: org.name,
        taxId: org.taxId,
        peppolId: org.peppolId,
        peppolScheme: org.peppolScheme,
        street: org.addressStreet,
        city: org.addressCity,
        state: org.addressState,
        postalCode: org.addressPostalCode,
        country: org.addressCountry || org.countryCode,
        email: org.contactEmail,
        phone: org.contactPhone,
      },
      customer: {
        name: inv.contact.name,
        taxId: inv.contact.taxNumber,
        peppolId: inv.contact.peppolId,
        peppolScheme: inv.contact.peppolScheme,
        street: inv.contact.addresses?.billing?.line1,
        city: inv.contact.addresses?.billing?.city,
        state: inv.contact.addresses?.billing?.state,
        postalCode: inv.contact.addresses?.billing?.postalCode,
        country: inv.contact.addresses?.billing?.country,
        email: inv.contact.email,
        phone: inv.contact.phone,
      },
      lines: inv.lines.map((l, i) => ({
        id: i + 1,
        description: l.description,
        quantity: l.quantity / 100,
        unitPrice: l.unitPrice / 100,
        lineAmount: l.amount,
        taxAmount: l.taxAmount,
        taxPercent: l.taxRate ? l.taxRate.rate / 100 : 0,
        taxName: l.taxRate?.name,
      })),
      subtotal: inv.subtotal,
      taxTotal: inv.taxTotal,
      total: inv.total,
      notes: inv.notes,
    };

    const errors = validateUblData(ublData);
    if (errors.length > 0) {
      return NextResponse.json(
        { error: "Missing required fields for UBL generation", details: errors },
        { status: 422 }
      );
    }

    const xml = generateUblXml(ublData);

    return new NextResponse(xml, {
      headers: {
        "Content-Type": "application/xml",
        "Content-Disposition": `attachment; filename="invoice-${inv.invoiceNumber}.xml"`,
      },
    });
  } catch (err) {
    return handleError(err);
  }
}
