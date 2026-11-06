import { db } from "@/lib/db";
import { contact, inventoryItem, inventoryItemSupplier } from "@/lib/db/schema";
import { and, asc, desc, eq, ne } from "drizzle-orm";
import { notDeleted } from "@/lib/db/soft-delete";
import { fail, type OpsContext } from "@/lib/api/inventory-ops";

/**
 * Suppliers linked to an inventory item (who you buy it from, their code,
 * lead time and price in cents). One link per supplier per item; at most one
 * preferred supplier per item. Shared by the REST routes and the MCP tools.
 */

export interface SupplierLinkInput {
  supplierCode?: string | null;
  leadTimeDays?: number;
  /** Cents per unit. */
  purchasePrice?: number;
  isPreferred?: boolean;
}

async function assertItem(organizationId: string, itemId: string) {
  const item = await db.query.inventoryItem.findFirst({
    where: and(eq(inventoryItem.id, itemId), eq(inventoryItem.organizationId, organizationId), notDeleted(inventoryItem.deletedAt)),
    columns: { id: true },
  });
  if (!item) fail("Inventory item not found", 404);
}

export async function listItemSuppliers(organizationId: string, itemId: string) {
  await assertItem(organizationId, itemId);
  return db
    .select({
      id: inventoryItemSupplier.id,
      inventoryItemId: inventoryItemSupplier.inventoryItemId,
      contactId: inventoryItemSupplier.contactId,
      supplierCode: inventoryItemSupplier.supplierCode,
      leadTimeDays: inventoryItemSupplier.leadTimeDays,
      purchasePrice: inventoryItemSupplier.purchasePrice,
      isPreferred: inventoryItemSupplier.isPreferred,
      createdAt: inventoryItemSupplier.createdAt,
      updatedAt: inventoryItemSupplier.updatedAt,
      contactName: contact.name,
      contactEmail: contact.email,
    })
    .from(inventoryItemSupplier)
    .innerJoin(contact, eq(inventoryItemSupplier.contactId, contact.id))
    .where(and(eq(inventoryItemSupplier.inventoryItemId, itemId), eq(inventoryItemSupplier.organizationId, organizationId)))
    .orderBy(desc(inventoryItemSupplier.isPreferred), asc(contact.name));
}

async function clearOtherPreferred(organizationId: string, itemId: string, keepId: string) {
  await db
    .update(inventoryItemSupplier)
    .set({ isPreferred: false, updatedAt: new Date() })
    .where(
      and(
        eq(inventoryItemSupplier.organizationId, organizationId),
        eq(inventoryItemSupplier.inventoryItemId, itemId),
        ne(inventoryItemSupplier.id, keepId)
      )
    );
}

export async function linkItemSupplier(ctx: OpsContext, itemId: string, input: SupplierLinkInput & { contactId: string }) {
  await assertItem(ctx.organizationId, itemId);
  const supplier = await db.query.contact.findFirst({
    where: and(eq(contact.id, input.contactId), eq(contact.organizationId, ctx.organizationId), notDeleted(contact.deletedAt)),
    columns: { id: true },
  });
  if (!supplier) fail("Contact not found", 404);
  const existing = await db.query.inventoryItemSupplier.findFirst({
    where: and(eq(inventoryItemSupplier.inventoryItemId, itemId), eq(inventoryItemSupplier.contactId, input.contactId)),
    columns: { id: true },
  });
  if (existing) fail("This supplier is already linked to the item", 409);
  const [created] = await db
    .insert(inventoryItemSupplier)
    .values({
      organizationId: ctx.organizationId,
      inventoryItemId: itemId,
      contactId: input.contactId,
      supplierCode: input.supplierCode ?? null,
      leadTimeDays: input.leadTimeDays ?? 0,
      purchasePrice: input.purchasePrice ?? 0,
      isPreferred: input.isPreferred ?? false,
    })
    .returning();
  if (created.isPreferred) await clearOtherPreferred(ctx.organizationId, itemId, created.id);
  return created;
}

async function loadLink(organizationId: string, itemId: string, linkId: string) {
  const link = await db.query.inventoryItemSupplier.findFirst({
    where: and(
      eq(inventoryItemSupplier.id, linkId),
      eq(inventoryItemSupplier.inventoryItemId, itemId),
      eq(inventoryItemSupplier.organizationId, organizationId)
    ),
  });
  if (!link) fail("Supplier link not found", 404);
  return link;
}

export async function updateItemSupplier(ctx: OpsContext, itemId: string, linkId: string, input: SupplierLinkInput) {
  await assertItem(ctx.organizationId, itemId);
  await loadLink(ctx.organizationId, itemId, linkId);
  const [updated] = await db
    .update(inventoryItemSupplier)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(inventoryItemSupplier.id, linkId))
    .returning();
  if (updated.isPreferred) await clearOtherPreferred(ctx.organizationId, itemId, linkId);
  return updated;
}

export async function unlinkItemSupplier(ctx: OpsContext, itemId: string, linkId: string) {
  await assertItem(ctx.organizationId, itemId);
  await loadLink(ctx.organizationId, itemId, linkId);
  await db.delete(inventoryItemSupplier).where(eq(inventoryItemSupplier.id, linkId));
}
