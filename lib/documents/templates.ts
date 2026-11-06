import { db } from "@/lib/db";
import { documentTemplate, organization } from "@/lib/db/schema";
import { and, desc, eq, inArray } from "drizzle-orm";
import { notDeleted } from "@/lib/db/soft-delete";
import { defaultsToUnset, type DocumentTemplateType } from "./template-text";

type DbOrTx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * The organization's default template for a document type, or undefined when
 * none is set (the PDF then uses the built-in look). If more than one row is
 * flagged default (legacy data), the most recently updated one wins.
 */
export async function getDefaultTemplate(organizationId: string, type: DocumentTemplateType) {
  return db.query.documentTemplate.findFirst({
    where: and(
      eq(documentTemplate.organizationId, organizationId),
      eq(documentTemplate.type, type),
      eq(documentTemplate.isDefault, true),
      notDeleted(documentTemplate.deletedAt)
    ),
    orderBy: desc(documentTemplate.updatedAt),
  });
}

/**
 * Switch off the default flag on every other template of `type` when the
 * template being saved becomes the default, so there's exactly one default per
 * organization and type. Call inside the same transaction as the insert/update.
 */
export async function clearOtherDefaults(
  tx: DbOrTx,
  organizationId: string,
  target: { id?: string | null; type: DocumentTemplateType; isDefault?: boolean | null }
): Promise<string[]> {
  if (!target.isDefault) return [];
  const sameType = await tx
    .select({ id: documentTemplate.id, type: documentTemplate.type, isDefault: documentTemplate.isDefault })
    .from(documentTemplate)
    .where(
      and(
        eq(documentTemplate.organizationId, organizationId),
        eq(documentTemplate.type, target.type),
        eq(documentTemplate.isDefault, true),
        notDeleted(documentTemplate.deletedAt)
      )
    );
  const ids = defaultsToUnset(sameType, target);
  if (ids.length > 0) {
    await tx
      .update(documentTemplate)
      .set({ isDefault: false, updatedAt: new Date() })
      .where(and(eq(documentTemplate.organizationId, organizationId), inArray(documentTemplate.id, ids)));
  }
  return ids;
}

/** Company details printed on a PDF, from the live organization record. */
export async function loadOrgInfo(organizationId: string) {
  const org = await db.query.organization.findFirst({
    where: eq(organization.id, organizationId),
  });
  const orgAddress = [org?.addressStreet, org?.addressCity, org?.addressState, org?.addressPostalCode, org?.addressCountry]
    .filter(Boolean)
    .join(", ");
  return {
    name: org?.name || "Company",
    address: orgAddress || null,
    taxId: org?.taxId || null,
    registrationNumber: org?.businessRegistrationNumber || null,
    phone: org?.contactPhone || null,
    email: org?.contactEmail || null,
    countryCode: org?.countryCode || null,
  };
}
