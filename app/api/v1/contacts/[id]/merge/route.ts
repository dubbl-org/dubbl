import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  contact,
  contactPerson,
  // Invoicing
  invoice,
  quote,
  creditNote,
  salesReceipt,
  customerCredit,
  // Bills / purchasing
  bill,
  purchaseOrder,
  debitNote,
  purchaseRequisition,
  goodsReceipt,
  // Payments
  payment,
  // Banking
  bankTransaction,
  bankRule,
  // CRM / projects / recurring
  deal,
  project,
  recurringTemplate,
  // Scheduled payments
  scheduledPayment,
  paymentBatchItem,
  // Inventory
  inventoryItemSupplier,
  // Portal
  portalAccessToken,
  // Polymorphic
  document,
  attachment,
  entityTag,
} from "@/lib/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound, error } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { logAudit } from "@/lib/api/audit";
import { z } from "zod";

const mergeSchema = z.object({
  targetContactId: z.string().uuid(),
});

// Tables with both an organization_id and a contact_id column. Repointed with
// an org guard for defense-in-depth. Keep in sync with schema columns that
// reference contact.id.
const CONTACT_FK_TABLES_ORG_SCOPED = [
  // Invoicing
  invoice,
  quote,
  creditNote,
  salesReceipt,
  customerCredit,
  // Bills / purchasing
  bill,
  purchaseOrder,
  debitNote,
  purchaseRequisition,
  goodsReceipt,
  // Payments
  payment,
  // Banking
  bankRule,
  // CRM / projects / recurring
  deal,
  project,
  recurringTemplate,
  // Scheduled payments
  scheduledPayment,
  // Portal
  portalAccessToken,
] as const;

// Tables with a contact_id but NO organization_id column (they scope through a
// parent: bank_transaction -> bank_account, payment_batch_item -> batch,
// contact_person -> contact). The source contact is already verified to belong
// to the org, so matching on contact_id alone only touches this org's rows.
const CONTACT_FK_TABLES_UNSCOPED = [
  bankTransaction,
  paymentBatchItem,
  contactPerson,
] as const;

/**
 * Merge a source contact into a target contact. All records that reference the
 * source contact are repointed to the target, then the source is soft-deleted.
 * The contact named in the URL ([id]) is the SOURCE; targetContactId is the
 * survivor.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:contacts");
    const { id: sourceId } = await params;

    const body = await request.json();
    const { targetContactId } = mergeSchema.parse(body);

    if (sourceId === targetContactId) {
      return error("Cannot merge a contact into itself", 400);
    }

    const [source, target] = await Promise.all([
      db.query.contact.findFirst({
        where: and(
          eq(contact.id, sourceId),
          eq(contact.organizationId, ctx.organizationId),
          notDeleted(contact.deletedAt)
        ),
      }),
      db.query.contact.findFirst({
        where: and(
          eq(contact.id, targetContactId),
          eq(contact.organizationId, ctx.organizationId),
          notDeleted(contact.deletedAt)
        ),
      }),
    ]);

    if (!source) return notFound("Source contact");
    if (!target) return notFound("Target contact");

    await db.transaction(async (tx) => {
      // 1a. Repoint org-scoped contact_id FKs from source -> target.
      for (const table of CONTACT_FK_TABLES_ORG_SCOPED) {
        await tx
          .update(table)
          .set({ contactId: targetContactId })
          .where(
            and(
              eq(table.contactId, sourceId),
              eq(table.organizationId, ctx.organizationId)
            )
          );
      }

      // 1b. Repoint contact_id FKs on tables without an organization_id column.
      for (const table of CONTACT_FK_TABLES_UNSCOPED) {
        await tx
          .update(table)
          .set({ contactId: targetContactId })
          .where(eq(table.contactId, sourceId));
      }

      // 2. inventory_item_supplier has a unique (inventory_item_id, contact_id)
      //    constraint, so repointing could collide with an existing target row.
      //    Move only the rows whose (item) is not already linked to the target,
      //    then drop any leftover source rows that would have duplicated.
      await tx
        .update(inventoryItemSupplier)
        .set({ contactId: targetContactId })
        .where(
          and(
            eq(inventoryItemSupplier.contactId, sourceId),
            eq(inventoryItemSupplier.organizationId, ctx.organizationId),
            sql`NOT EXISTS (
              SELECT 1 FROM ${inventoryItemSupplier} AS existing
              WHERE existing.inventory_item_id = ${inventoryItemSupplier.inventoryItemId}
                AND existing.contact_id = ${targetContactId}
            )`
          )
        );
      await tx
        .delete(inventoryItemSupplier)
        .where(
          and(
            eq(inventoryItemSupplier.contactId, sourceId),
            eq(inventoryItemSupplier.organizationId, ctx.organizationId)
          )
        );

      // 3. Polymorphic document / attachment references (entityType="contact").
      await tx
        .update(document)
        .set({ entityId: targetContactId })
        .where(
          and(
            eq(document.organizationId, ctx.organizationId),
            eq(document.entityType, "contact"),
            eq(document.entityId, sourceId)
          )
        );
      await tx
        .update(attachment)
        .set({ entityId: targetContactId })
        .where(
          and(
            eq(attachment.organizationId, ctx.organizationId),
            eq(attachment.entityType, "contact"),
            eq(attachment.entityId, sourceId)
          )
        );

      // 4. Polymorphic entity tags (unique on tag_id+entity_type+entity_id), so
      //    repoint only tags the target doesn't already carry, then clean up.
      await tx
        .update(entityTag)
        .set({ entityId: targetContactId })
        .where(
          and(
            eq(entityTag.entityType, "contact"),
            eq(entityTag.entityId, sourceId),
            sql`NOT EXISTS (
              SELECT 1 FROM ${entityTag} AS existing
              WHERE existing.tag_id = ${entityTag.tagId}
                AND existing.entity_type = 'contact'
                AND existing.entity_id = ${targetContactId}
            )`
          )
        );
      await tx
        .delete(entityTag)
        .where(
          and(
            eq(entityTag.entityType, "contact"),
            eq(entityTag.entityId, sourceId)
          )
        );

      // 5. Soft-delete the now-emptied source contact.
      await tx
        .update(contact)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(eq(contact.id, sourceId));
    });

    // Audit both contacts so the merge is traceable from either side.
    logAudit({
      ctx,
      action: "merge",
      entityType: "contact",
      entityId: sourceId,
      changes: { mergedInto: targetContactId },
      request,
    });
    logAudit({
      ctx,
      action: "merge",
      entityType: "contact",
      entityId: targetContactId,
      changes: { mergedFrom: sourceId },
      request,
    });

    return NextResponse.json({
      success: true,
      sourceContactId: sourceId,
      targetContactId,
    });
  } catch (err) {
    return handleError(err);
  }
}
