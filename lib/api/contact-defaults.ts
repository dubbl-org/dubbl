import { db } from "@/lib/db";
import { contact, inventoryItem } from "@/lib/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { findAccountForCode } from "@/lib/api/account-roles";
import type { ContactDefaults } from "@/lib/contact-defaults";

export { applyContactDefaults, type ContactDefaults } from "@/lib/contact-defaults";

/** A contact's bookkeeping defaults (Contacts → Bookkeeping), or null if not found. */
export async function loadContactDefaults(organizationId: string, contactId: string): Promise<ContactDefaults | null> {
  const c = await db.query.contact.findFirst({
    where: and(eq(contact.id, contactId), eq(contact.organizationId, organizationId)),
    columns: {
      defaultRevenueAccountId: true,
      defaultExpenseAccountId: true,
      defaultTaxRateId: true,
      isTaxExempt: true,
    },
  });
  if (!c) return null;
  return {
    revenueAccountId: c.defaultRevenueAccountId,
    expenseAccountId: c.defaultExpenseAccountId,
    taxRateId: c.defaultTaxRateId,
    isTaxExempt: c.isTaxExempt,
  };
}

/**
 * Sales lines that still have no income account after the contact's defaults
 * get the stock item's income account, else the organization's Sales account
 * (4000). Without one a line posts no income and no receivable, so the
 * invoice's balance would never reach the ledger.
 */
export async function fillSalesAccounts<L extends { accountId?: string | null; inventoryItemId?: string | null }>(
  organizationId: string,
  lines: L[]
): Promise<L[]> {
  if (lines.every((l) => l.accountId)) return lines;
  const itemIds = [...new Set(lines.filter((l) => !l.accountId && l.inventoryItemId).map((l) => l.inventoryItemId as string))];
  const itemAccounts = new Map<string, string | null>();
  if (itemIds.length > 0) {
    const items = await db.query.inventoryItem.findMany({
      where: and(eq(inventoryItem.organizationId, organizationId), inArray(inventoryItem.id, itemIds)),
      columns: { id: true, revenueAccountId: true },
    });
    for (const i of items) itemAccounts.set(i.id, i.revenueAccountId);
  }
  const sales = (await findAccountForCode(organizationId, "4000"))?.id ?? null;
  return lines.map((l) =>
    l.accountId ? l : { ...l, accountId: (l.inventoryItemId && itemAccounts.get(l.inventoryItemId)) || sales }
  );
}
