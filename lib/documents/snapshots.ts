import { db } from "@/lib/db";
import { organization } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export interface SenderSnapshot {
  name: string;
  address: string | null;
  taxId: string | null;
  registrationNumber: string | null;
  phone: string | null;
  email: string | null;
  countryCode: string | null;
}

export interface RecipientSnapshot {
  name: string;
  email: string | null;
  address: string | null;
  taxNumber: string | null;
}

export function formatContactAddress(
  addresses: Record<string, { line1?: string; line2?: string; city?: string; state?: string; postalCode?: string; country?: string }> | null
): string | null {
  if (!addresses) return null;
  const billing = addresses.billing || Object.values(addresses)[0];
  if (!billing) return null;
  return [billing.line1, billing.line2, billing.city, billing.state, billing.postalCode, billing.country]
    .filter(Boolean)
    .join(", ");
}

export async function buildSenderSnapshot(organizationId: string): Promise<SenderSnapshot> {
  const org = await db.query.organization.findFirst({
    where: eq(organization.id, organizationId),
  });

  const address = [org?.addressStreet, org?.addressCity, org?.addressState, org?.addressPostalCode, org?.addressCountry]
    .filter(Boolean)
    .join(", ");

  return {
    name: org?.name || "Company",
    address: address || null,
    taxId: org?.taxId || null,
    registrationNumber: org?.businessRegistrationNumber || null,
    phone: org?.contactPhone || null,
    email: org?.contactEmail || null,
    countryCode: org?.countryCode || null,
  };
}

export function buildRecipientSnapshot(contact: {
  name?: string | null;
  email?: string | null;
  addresses?: unknown;
  taxNumber?: string | null;
}): RecipientSnapshot {
  const contactAddress = formatContactAddress(
    contact.addresses as Record<string, { line1?: string; line2?: string; city?: string; state?: string; postalCode?: string; country?: string }> | null
  );

  return {
    name: contact.name || "Unknown",
    email: contact.email || null,
    address: contactAddress,
    taxNumber: contact.taxNumber || null,
  };
}
