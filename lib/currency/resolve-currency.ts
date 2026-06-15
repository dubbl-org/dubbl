import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { contact, organization } from "@/lib/db/schema";

/**
 * Resolve the currency for a new document (invoice, bill, quote, …).
 *
 * Precedence: explicit request > the contact's default currency > the
 * organization's base currency > "USD". This gives Xero-style behaviour —
 * a contact's currency is pre-filled automatically, with an explicit override
 * always winning — so the common case needs no manual selection.
 */
export async function resolveDocumentCurrency(
  organizationId: string,
  requested: string | undefined | null,
  contactId?: string | null
): Promise<string> {
  if (requested) return requested;

  if (contactId) {
    const c = await db.query.contact.findFirst({
      where: eq(contact.id, contactId),
      columns: { currencyCode: true },
    });
    if (c?.currencyCode) return c.currencyCode;
  }

  const org = await db.query.organization.findFirst({
    where: eq(organization.id, organizationId),
    columns: { defaultCurrency: true },
  });
  return org?.defaultCurrency ?? "USD";
}
