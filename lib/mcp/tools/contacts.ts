import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { currencyCodeSchema } from "@/lib/currency/zod";
import { db } from "@/lib/db";
import {
  contact,
  invoice,
  quote,
  creditNote,
  salesReceipt,
  customerCredit,
  bill,
  purchaseOrder,
  debitNote,
  purchaseRequisition,
  goodsReceipt,
  payment,
  bankTransaction,
  bankRule,
  deal,
  project,
  recurringTemplate,
  scheduledPayment,
  paymentBatchItem,
  inventoryItemSupplier,
  portalAccessToken,
  document,
  attachment,
  entityTag,
} from "@/lib/db/schema";
import { eq, and, or, ilike, sql } from "drizzle-orm";
import { notDeleted, softDelete } from "@/lib/db/soft-delete";
import { requireRole } from "@/lib/api/require-role";
import { wrapTool } from "@/lib/mcp/errors";
import { checkResourceLimit, checkMultiCurrency } from "@/lib/api/check-limit";
import { logAudit } from "@/lib/api/audit";
import type { AuthContext } from "@/lib/api/auth-context";

// Tables with both organization_id and contact_id, repointed on merge.
const CONTACT_FK_TABLES_ORG_SCOPED = [
  invoice,
  quote,
  creditNote,
  salesReceipt,
  customerCredit,
  bill,
  purchaseOrder,
  debitNote,
  purchaseRequisition,
  goodsReceipt,
  payment,
  bankRule,
  deal,
  project,
  recurringTemplate,
  scheduledPayment,
  portalAccessToken,
] as const;

// Tables with contact_id but no organization_id column (scoped via a parent).
const CONTACT_FK_TABLES_UNSCOPED = [
  bankTransaction,
  paymentBatchItem,
] as const;

export function registerContactTools(server: McpServer, ctx: AuthContext) {
  server.tool(
    "list_contacts",
    "List contacts (customers, suppliers, or both). Supports search by name/email and filtering by type. Returns paginated results.",
    {
      search: z
        .string()
        .optional()
        .describe("Search by name or email"),
      type: z
        .enum(["customer", "supplier", "both"])
        .optional()
        .describe("Filter by contact type"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .default(50)
        .describe("Number of contacts to return (max 100)"),
      page: z
        .number()
        .int()
        .min(1)
        .optional()
        .default(1)
        .describe("Page number"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const conditions = [
          eq(contact.organizationId, ctx.organizationId),
          notDeleted(contact.deletedAt),
        ];

        if (params.search) {
          conditions.push(
            or(
              ilike(contact.name, `%${params.search}%`),
              ilike(contact.email, `%${params.search}%`)
            )!
          );
        }
        if (params.type) {
          conditions.push(eq(contact.type, params.type));
        }

        const offset = (params.page - 1) * params.limit;

        const contacts = await db.query.contact.findMany({
          where: and(...conditions),
          orderBy: contact.name,
          limit: params.limit,
          offset,
        });

        const [countResult] = await db
          .select({ count: sql<number>`count(*)`.mapWith(Number) })
          .from(contact)
          .where(and(...conditions));

        return {
          contacts,
          total: Number(countResult?.count ?? 0),
          page: params.page,
          limit: params.limit,
        };
      })
  );

  server.tool(
    "get_contact",
    "Get a single contact by ID with their details, default accounts, and contact people.",
    {
      contactId: z.string().describe("The UUID of the contact"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const found = await db.query.contact.findFirst({
          where: and(
            eq(contact.id, params.contactId),
            eq(contact.organizationId, ctx.organizationId),
            notDeleted(contact.deletedAt)
          ),
          with: {
            defaultRevenueAccount: true,
            defaultExpenseAccount: true,
            defaultTaxRate: true,
            people: true,
          },
        });

        if (!found) throw new Error("Contact not found");
        return { contact: found };
      })
  );

  server.tool(
    "create_contact",
    "Create a new contact (customer, supplier, or both). Payment terms are in days (default 30).",
    {
      name: z.string().describe("Contact name"),
      email: z.string().optional().describe("Email address"),
      phone: z.string().optional().describe("Phone number"),
      taxNumber: z
        .string()
        .optional()
        .describe("Tax identification number"),
      type: z
        .enum(["customer", "supplier", "both"])
        .optional()
        .default("customer")
        .describe("Contact type"),
      paymentTermsDays: z
        .number()
        .int()
        .min(0)
        .optional()
        .default(30)
        .describe("Payment terms in days"),
      notes: z.string().optional().describe("Notes"),
      currencyCode: z
        .string()
        .optional()
        .default("USD")
        .describe("Default currency code"),
      is1099Vendor: z
        .boolean()
        .optional()
        .describe("Whether this vendor is reportable on a US 1099 (default false)"),
      w9TaxClassification: z
        .string()
        .optional()
        .describe(
          "W-9 federal tax classification, e.g. 'individual', 'c_corp', 's_corp', 'partnership', 'trust_estate', 'llc'"
        ),
      taxIdentifier: z
        .string()
        .optional()
        .describe("Taxpayer ID (TIN/SSN/EIN) as reported on the W-9"),
      backupWithholding: z
        .boolean()
        .optional()
        .describe("Whether the vendor is subject to 24% backup withholding (default false)"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:contacts");

        await checkResourceLimit(ctx.organizationId, contact, contact.organizationId, "contacts", contact.deletedAt);
        await checkMultiCurrency(ctx.organizationId, params.currencyCode ?? "USD");

        const [created] = await db
          .insert(contact)
          .values({
            organizationId: ctx.organizationId,
            name: params.name,
            email: params.email ?? null,
            phone: params.phone ?? null,
            taxNumber: params.taxNumber ?? null,
            type: params.type,
            paymentTermsDays: params.paymentTermsDays,
            notes: params.notes ?? null,
            currencyCode: params.currencyCode,
            ...(params.is1099Vendor !== undefined && { is1099Vendor: params.is1099Vendor }),
            w9TaxClassification: params.w9TaxClassification ?? null,
            taxIdentifier: params.taxIdentifier ?? null,
            ...(params.backupWithholding !== undefined && { backupWithholding: params.backupWithholding }),
          })
          .returning();

        return { contact: created };
      })
  );

  server.tool(
    "update_contact",
    "Update an existing contact's details. Only provided fields are updated.",
    {
      contactId: z.string().describe("The UUID of the contact to update"),
      name: z.string().optional().describe("New name"),
      email: z.string().optional().describe("New email"),
      phone: z.string().optional().describe("New phone"),
      taxNumber: z.string().optional().describe("New tax number"),
      type: z
        .enum(["customer", "supplier", "both"])
        .optional()
        .describe("New contact type"),
      paymentTermsDays: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("New payment terms in days"),
      notes: z.string().optional().describe("New notes"),
      currencyCode: currencyCodeSchema.optional().describe("New currency code"),
      is1099Vendor: z
        .boolean()
        .optional()
        .describe("Whether this vendor is reportable on a US 1099"),
      w9TaxClassification: z
        .string()
        .nullable()
        .optional()
        .describe(
          "W-9 federal tax classification, e.g. 'individual', 'c_corp', 's_corp', 'partnership', 'trust_estate', 'llc' (null to clear)"
        ),
      taxIdentifier: z
        .string()
        .nullable()
        .optional()
        .describe("Taxpayer ID (TIN/SSN/EIN) as reported on the W-9 (null to clear)"),
      backupWithholding: z
        .boolean()
        .optional()
        .describe("Whether the vendor is subject to 24% backup withholding"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:contacts");

        const existing = await db.query.contact.findFirst({
          where: and(
            eq(contact.id, params.contactId),
            eq(contact.organizationId, ctx.organizationId),
            notDeleted(contact.deletedAt)
          ),
        });

        if (!existing) throw new Error("Contact not found");

        const { contactId, ...updates } = params;
        const cleanUpdates = Object.fromEntries(
          Object.entries(updates).filter(([, v]) => v !== undefined)
        );

        const [updated] = await db
          .update(contact)
          .set({ ...cleanUpdates, updatedAt: new Date() })
          .where(eq(contact.id, contactId))
          .returning();

        return { contact: updated };
      })
  );

  server.tool(
    "merge_contacts",
    "Merge a duplicate (source) contact into a surviving (target) contact. Every record referencing the source — invoices, bills, payments, credit/debit notes, quotes, sales receipts, customer credits, purchase orders/requisitions, goods receipts, bank transactions, bank rules, deals, projects, recurring templates, scheduled payments, payment batch items, inventory supplier links, portal tokens, documents/attachments and tags — is repointed to the target inside a single transaction, then the source contact is soft-deleted. Requires the manage:contacts permission. This cannot be undone.",
    {
      sourceContactId: z
        .string()
        .describe("The UUID of the duplicate contact to merge away (will be soft-deleted)"),
      targetContactId: z
        .string()
        .describe("The UUID of the surviving contact that all records are repointed to"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:contacts");

        if (params.sourceContactId === params.targetContactId) {
          throw new Error("Cannot merge a contact into itself");
        }

        const [source, target] = await Promise.all([
          db.query.contact.findFirst({
            where: and(
              eq(contact.id, params.sourceContactId),
              eq(contact.organizationId, ctx.organizationId),
              notDeleted(contact.deletedAt)
            ),
          }),
          db.query.contact.findFirst({
            where: and(
              eq(contact.id, params.targetContactId),
              eq(contact.organizationId, ctx.organizationId),
              notDeleted(contact.deletedAt)
            ),
          }),
        ]);

        if (!source) throw new Error("Source contact not found");
        if (!target) throw new Error("Target contact not found");

        await db.transaction(async (tx) => {
          // 1a. Org-scoped contact_id FKs.
          for (const table of CONTACT_FK_TABLES_ORG_SCOPED) {
            await tx
              .update(table)
              .set({ contactId: params.targetContactId })
              .where(
                and(
                  eq(table.contactId, params.sourceContactId),
                  eq(table.organizationId, ctx.organizationId)
                )
              );
          }

          // 1b. contact_id FKs on tables without an organization_id column.
          for (const table of CONTACT_FK_TABLES_UNSCOPED) {
            await tx
              .update(table)
              .set({ contactId: params.targetContactId })
              .where(eq(table.contactId, params.sourceContactId));
          }

          // 2. inventory_item_supplier — unique (item, contact); avoid dup rows.
          await tx
            .update(inventoryItemSupplier)
            .set({ contactId: params.targetContactId })
            .where(
              and(
                eq(inventoryItemSupplier.contactId, params.sourceContactId),
                eq(inventoryItemSupplier.organizationId, ctx.organizationId),
                sql`NOT EXISTS (
                  SELECT 1 FROM ${inventoryItemSupplier} AS existing
                  WHERE existing.inventory_item_id = ${inventoryItemSupplier.inventoryItemId}
                    AND existing.contact_id = ${params.targetContactId}
                )`
              )
            );
          await tx
            .delete(inventoryItemSupplier)
            .where(
              and(
                eq(inventoryItemSupplier.contactId, params.sourceContactId),
                eq(inventoryItemSupplier.organizationId, ctx.organizationId)
              )
            );

          // 3. Polymorphic documents / attachments (entityType="contact").
          await tx
            .update(document)
            .set({ entityId: params.targetContactId })
            .where(
              and(
                eq(document.organizationId, ctx.organizationId),
                eq(document.entityType, "contact"),
                eq(document.entityId, params.sourceContactId)
              )
            );
          await tx
            .update(attachment)
            .set({ entityId: params.targetContactId })
            .where(
              and(
                eq(attachment.organizationId, ctx.organizationId),
                eq(attachment.entityType, "contact"),
                eq(attachment.entityId, params.sourceContactId)
              )
            );

          // 4. Polymorphic entity tags — unique (tag, type, entity); dedupe.
          await tx
            .update(entityTag)
            .set({ entityId: params.targetContactId })
            .where(
              and(
                eq(entityTag.entityType, "contact"),
                eq(entityTag.entityId, params.sourceContactId),
                sql`NOT EXISTS (
                  SELECT 1 FROM ${entityTag} AS existing
                  WHERE existing.tag_id = ${entityTag.tagId}
                    AND existing.entity_type = 'contact'
                    AND existing.entity_id = ${params.targetContactId}
                )`
              )
            );
          await tx
            .delete(entityTag)
            .where(
              and(
                eq(entityTag.entityType, "contact"),
                eq(entityTag.entityId, params.sourceContactId)
              )
            );

          // 5. Soft-delete the source.
          await tx
            .update(contact)
            .set({ deletedAt: new Date(), updatedAt: new Date() })
            .where(eq(contact.id, params.sourceContactId));
        });

        await logAudit({
          ctx,
          action: "merge",
          entityType: "contact",
          entityId: params.sourceContactId,
          changes: { mergedInto: params.targetContactId },
        });
        await logAudit({
          ctx,
          action: "merge",
          entityType: "contact",
          entityId: params.targetContactId,
          changes: { mergedFrom: params.sourceContactId },
        });

        return {
          success: true,
          sourceContactId: params.sourceContactId,
          targetContactId: params.targetContactId,
        };
      })
  );

  server.tool(
    "delete_contact",
    "Soft-delete a contact by ID. The contact is marked deleted (not physically removed) and excluded from future listings. Requires the manage:contacts permission.",
    {
      contactId: z
        .string()
        .describe("The UUID of the contact to delete"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:contacts");

        const existing = await db.query.contact.findFirst({
          where: and(
            eq(contact.id, params.contactId),
            eq(contact.organizationId, ctx.organizationId),
            notDeleted(contact.deletedAt)
          ),
        });

        if (!existing) throw new Error("Contact not found");

        await db
          .update(contact)
          .set(softDelete())
          .where(eq(contact.id, params.contactId));

        await logAudit({
          ctx,
          action: "delete",
          entityType: "contact",
          entityId: params.contactId,
          changes: existing as Record<string, unknown>,
        });

        return { success: true, contactId: params.contactId };
      })
  );
}
