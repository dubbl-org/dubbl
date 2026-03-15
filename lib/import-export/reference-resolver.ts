import { db } from "@/lib/db";
import { contact, chartAccount } from "@/lib/db/schema";
import { eq, and, ilike } from "drizzle-orm";
import { notDeleted } from "@/lib/db/soft-delete";

/**
 * Find a contact by name (case-insensitive) within an org.
 */
export async function resolveContactByName(
  orgId: string,
  name: string
): Promise<string | null> {
  if (!name) return null;
  const found = await db.query.contact.findFirst({
    where: and(
      eq(contact.organizationId, orgId),
      ilike(contact.name, name.trim()),
      notDeleted(contact.deletedAt),
    ),
    columns: { id: true },
  });
  return found?.id ?? null;
}

/**
 * Find a chart account by code (case-insensitive) within an org.
 */
export async function resolveAccountByCode(
  orgId: string,
  code: string
): Promise<string | null> {
  if (!code) return null;
  const found = await db.query.chartAccount.findFirst({
    where: and(
      eq(chartAccount.organizationId, orgId),
      ilike(chartAccount.code, code.trim()),
      notDeleted(chartAccount.deletedAt),
    ),
    columns: { id: true },
  });
  return found?.id ?? null;
}
