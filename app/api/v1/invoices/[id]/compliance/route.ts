import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { invoice, organization } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { notFound, handleError } from "@/lib/api/response";
import { checkInvoiceCompliance } from "@/lib/documents/compliance";
import type { SenderSnapshot, RecipientSnapshot } from "@/lib/documents/snapshots";
import { formatContactAddress } from "@/lib/documents/snapshots";

type AddressRecord = Record<string, { line1?: string; line2?: string; city?: string; state?: string; postalCode?: string; country?: string }>;

function extractBillingCountry(addresses: AddressRecord | null): string | null {
  if (!addresses) return null;
  const billing = addresses.billing || Object.values(addresses)[0];
  return billing?.country || null;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);

    const inv = await db.query.invoice.findFirst({
      where: and(
        eq(invoice.id, id),
        eq(invoice.organizationId, ctx.organizationId)
      ),
      with: { lines: true, contact: true },
    });

    if (!inv) return notFound("Invoice");

    // Use snapshot if available, otherwise use live data
    const sender = inv.senderSnapshot as SenderSnapshot | null;
    const recipient = inv.recipientSnapshot as RecipientSnapshot | null;

    let orgData;
    if (sender) {
      orgData = {
        name: sender.name || null,
        address: sender.address || null,
        taxId: sender.taxId || null,
        countryCode: sender.countryCode || null,
        businessRegistrationNumber: sender.registrationNumber || null,
      };
    } else {
      const org = await db.query.organization.findFirst({
        where: eq(organization.id, ctx.organizationId),
      });
      const orgAddress = [org?.addressStreet, org?.addressCity, org?.addressState, org?.addressPostalCode, org?.addressCountry]
        .filter(Boolean)
        .join(", ");
      orgData = {
        name: org?.name || null,
        address: orgAddress || null,
        taxId: org?.taxId || null,
        countryCode: org?.countryCode || null,
        addressStreet: org?.addressStreet || null,
        addressCity: org?.addressCity || null,
        addressPostalCode: org?.addressPostalCode || null,
        addressCountry: org?.addressCountry || null,
        businessRegistrationNumber: org?.businessRegistrationNumber || null,
      };
    }

    const contactAddresses = (recipient ? null : inv.contact?.addresses) as AddressRecord | null;
    const contactAddress = recipient?.address ?? formatContactAddress(contactAddresses);
    const contactCountryCode = extractBillingCountry(contactAddresses);

    const typedLines = (inv.lines || []).map((l) => ({
      description: l.description || null,
      quantity: l.quantity ?? null,
      unitPrice: l.unitPrice ?? null,
      taxAmount: l.taxAmount ?? null,
    }));

    const warnings = checkInvoiceCompliance(
      orgData,
      {
        name: recipient?.name ?? inv.contact?.name ?? null,
        address: contactAddress,
        taxNumber: recipient?.taxNumber ?? inv.contact?.taxNumber ?? null,
        countryCode: contactCountryCode,
      },
      {
        invoiceNumber: inv.invoiceNumber,
        issueDate: inv.issueDate,
        dueDate: inv.dueDate,
        currencyCode: inv.currencyCode,
        notes: inv.notes,
        lines: typedLines,
      }
    );

    return NextResponse.json({ warnings });
  } catch (err) {
    return handleError(err);
  }
}
