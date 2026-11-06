import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  purchaseRequisition,
  purchaseRequisitionLine,
  purchaseOrder,
  purchaseOrderLine,
  contact,
  auditLog,
} from "@/lib/db/schema";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import { notDeleted } from "@/lib/db/soft-delete";
import { requireRole } from "@/lib/api/require-role";
import { getNextNumber } from "@/lib/api/numbering";
import { wrapTool } from "@/lib/mcp/errors";
import { preloadTaxRates } from "@/lib/api/tax-calculator";
import { buildRequisitionLines } from "@/lib/api/requisition-lines";
import type { AuthContext } from "@/lib/api/auth-context";

/**
 * MCP tools for purchase requisitions — an internal request to buy that flows
 * draft -> submitted -> approved/rejected, and once approved can be CONVERTED
 * into a purchase order (PO).
 *
 * MONEY/QUANTITY conventions (mirroring the REST routes):
 *  • create/update_purchase_requisition take unitPrice as a DECIMAL number (e.g.
 *    12.50 for $12.50) and quantity in WHOLE units (decimals allowed); both are
 *    stored internally as integers (unitPrice in cents, quantity x100). Line
 *    amount is quantity * unitPrice in integer cents; a line with a taxRateId
 *    gets exclusive tax on top (shared math in lib/api/requisition-lines.ts).
 *  • All amounts in RESULTS are integer cents; stored quantities are x100
 *    (5 units = 500).
 *  • All tools are org-scoped via the AuthContext and use direct Drizzle access
 *    (no HTTP self-calls).
 */
export function registerPurchaseRequisitionTools(
  server: McpServer,
  ctx: AuthContext
) {
  // ─── List purchase requisitions ─────────────────────────────────────
  server.tool(
    "list_purchase_requisitions",
    "List purchase requisitions with an optional status filter and pagination. Amounts (subtotal, taxTotal, total) are integer cents; line quantities are stored x100 (5 units = 500). Returns paginated requisitions with their contact and lines, plus the total count.",
    {
      status: z
        .enum(["draft", "submitted", "approved", "rejected", "converted"])
        .optional()
        .describe("Filter by requisition status"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .default(50)
        .describe("Number of requisitions to return (max 100)"),
      page: z
        .number()
        .int()
        .min(1)
        .optional()
        .default(1)
        .describe("Page number (1-based)"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const conditions = [
          eq(purchaseRequisition.organizationId, ctx.organizationId),
          notDeleted(purchaseRequisition.deletedAt),
        ];
        if (params.status)
          conditions.push(eq(purchaseRequisition.status, params.status));

        const offset = (params.page - 1) * params.limit;
        const requisitions = await db.query.purchaseRequisition.findMany({
          where: and(...conditions),
          orderBy: desc(purchaseRequisition.createdAt),
          limit: params.limit,
          offset,
          with: { contact: true, lines: true },
        });

        const [countResult] = await db
          .select({ count: sql<number>`count(*)`.mapWith(Number) })
          .from(purchaseRequisition)
          .where(and(...conditions));

        return {
          requisitions,
          total: Number(countResult?.count ?? 0),
          page: params.page,
          limit: params.limit,
        };
      })
  );

  // ─── Get a single purchase requisition ──────────────────────────────
  server.tool(
    "get_purchase_requisition",
    "Get a single purchase requisition by ID, including its contact and line items (each with its account and tax rate). Amounts are integer cents; line quantities are stored x100 (5 units = 500).",
    {
      requisitionId: z
        .string()
        .describe("The UUID of the purchase requisition"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const found = await db.query.purchaseRequisition.findFirst({
          where: and(
            eq(purchaseRequisition.id, params.requisitionId),
            eq(purchaseRequisition.organizationId, ctx.organizationId),
            notDeleted(purchaseRequisition.deletedAt)
          ),
          with: {
            contact: true,
            lines: {
              with: { account: true, taxRate: true },
              orderBy: (l, { asc }) => [asc(l.sortOrder)],
            },
          },
        });
        if (!found) throw new Error("Purchase requisition not found");
        return { requisition: found };
      })
  );

  const lineInput = z.object({
    description: z.string().min(1).describe("Line item description"),
    quantity: z
      .number()
      .optional()
      .default(1)
      .describe("Quantity requested, in whole units (decimals allowed)"),
    unitPrice: z
      .number()
      .optional()
      .default(0)
      .describe("Estimated unit price as a DECIMAL (e.g. 12.50 for $12.50), NOT cents"),
    accountId: z
      .string()
      .optional()
      .describe("Expense/asset account UUID for this line"),
    taxRateId: z
      .string()
      .optional()
      .describe("Tax rate UUID; exclusive tax is added on top of the line amount"),
  });

  async function assertOrgContact(contactId: string) {
    const found = await db.query.contact.findFirst({
      where: and(eq(contact.id, contactId), eq(contact.organizationId, ctx.organizationId)),
    });
    if (!found) throw new Error("Supplier contact not found");
  }

  // ─── Create a purchase requisition ──────────────────────────────────
  server.tool(
    "create_purchase_requisition",
    "Create a draft purchase requisition (an internal request to buy) with line items. unitPrice is a DECIMAL number (e.g. 12.50 for $12.50); quantity is in whole units (decimals allowed). The system computes each line amount (quantity * unitPrice) in integer cents, adds exclusive tax for lines with a taxRateId, and assigns a requisition number (REQ). A contact (supplier) is optional at this stage but is REQUIRED before the requisition can be converted to a PO (set it with update_purchase_requisition or pass it to convert_purchase_requisition). The requisition starts in 'draft'; send it for approval with submit_purchase_requisition. Returns the created requisition (subtotal, taxTotal, total in integer cents).",
    {
      contactId: z
        .string()
        .optional()
        .describe(
          "Supplier contact UUID (optional now; required before converting to a PO)"
        ),
      requestDate: z.string().describe("Request date (YYYY-MM-DD)"),
      requiredDate: z
        .string()
        .optional()
        .describe("Date the goods are needed by (YYYY-MM-DD)"),
      reference: z.string().optional().describe("Internal/external reference"),
      notes: z.string().optional().describe("Requisition notes"),
      lines: z
        .array(lineInput)
        .min(1)
        .describe("Purchase requisition line items (at least one)"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:purchases");
        if (params.contactId) await assertOrgContact(params.contactId);

        const requisitionNumber = await getNextNumber(
          ctx.organizationId,
          "purchase_requisition",
          "requisition_number",
          "REQ"
        );

        // Same line/total math as the REST route (new requisitions are USD,
        // the column default)
        const ratesMap = await preloadTaxRates(
          params.lines.map((l) => l.taxRateId).filter(Boolean) as string[]
        );
        const {
          lines: processedLines,
          subtotal,
          taxTotal,
          total,
        } = buildRequisitionLines(params.lines, "USD", ratesMap);

        const [created] = await db
          .insert(purchaseRequisition)
          .values({
            organizationId: ctx.organizationId,
            contactId: params.contactId || null,
            requisitionNumber,
            requestDate: params.requestDate,
            requiredDate: params.requiredDate || null,
            reference: params.reference || null,
            notes: params.notes || null,
            subtotal,
            taxTotal,
            total,
            requestedBy: ctx.userId,
          })
          .returning();

        if (processedLines.length > 0) {
          await db
            .insert(purchaseRequisitionLine)
            .values(
              processedLines.map((l) => ({ requisitionId: created.id, ...l }))
            );
        }

        await db.insert(auditLog).values({
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          action: "create",
          entityType: "purchase_requisition",
          entityId: created.id,
          changes: { requisitionNumber, total },
        });

        return { requisition: created };
      })
  );

  // ─── Update a purchase requisition ──────────────────────────────────
  server.tool(
    "update_purchase_requisition",
    "Edit a purchase requisition. A 'draft' or 'rejected' requisition can change any field; passing lines REPLACES all existing lines and recomputes subtotal, taxTotal and total (integer cents). An 'approved' requisition can only change its supplier (contactId), which converting to a PO needs. Submitted or converted requisitions can't be edited. Omitted fields are left unchanged; pass null to clear an optional field. Returns the updated requisition.",
    {
      requisitionId: z
        .string()
        .describe("The UUID of the purchase requisition to edit"),
      contactId: z
        .string()
        .nullable()
        .optional()
        .describe("Supplier contact UUID, or null to clear it"),
      requestDate: z
        .string()
        .optional()
        .describe("Request date (YYYY-MM-DD)"),
      requiredDate: z
        .string()
        .nullable()
        .optional()
        .describe("Date the goods are needed by (YYYY-MM-DD), or null to clear"),
      reference: z
        .string()
        .nullable()
        .optional()
        .describe("Internal/external reference, or null to clear"),
      notes: z
        .string()
        .nullable()
        .optional()
        .describe("Requisition notes, or null to clear"),
      lines: z
        .array(lineInput)
        .min(1)
        .optional()
        .describe("New full set of line items; replaces every existing line"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:purchases");
        const { requisitionId, ...fields } = params;

        const existing = await db.query.purchaseRequisition.findFirst({
          where: and(
            eq(purchaseRequisition.id, requisitionId),
            eq(purchaseRequisition.organizationId, ctx.organizationId),
            notDeleted(purchaseRequisition.deletedAt)
          ),
        });
        if (!existing) throw new Error("Purchase requisition not found");

        const supplierOnly = Object.entries(fields).every(
          ([k, v]) => k === "contactId" || v === undefined
        );
        if (
          !["draft", "rejected"].includes(existing.status) &&
          !(existing.status === "approved" && supplierOnly)
        ) {
          throw new Error(
            existing.status === "approved"
              ? "Only the supplier of an approved requisition can be changed"
              : "Only draft or rejected requisitions can be edited"
          );
        }
        if (fields.contactId) await assertOrgContact(fields.contactId);

        const built = fields.lines
          ? buildRequisitionLines(
              fields.lines,
              existing.currencyCode,
              await preloadTaxRates(
                fields.lines.map((l) => l.taxRateId).filter(Boolean) as string[]
              )
            )
          : null;

        const updated = await db.transaction(async (tx) => {
          if (built) {
            await tx
              .delete(purchaseRequisitionLine)
              .where(eq(purchaseRequisitionLine.requisitionId, requisitionId));
            await tx
              .insert(purchaseRequisitionLine)
              .values(built.lines.map((l) => ({ requisitionId, ...l })));
          }
          const [row] = await tx
            .update(purchaseRequisition)
            .set({
              ...(fields.contactId !== undefined && {
                contactId: fields.contactId || null,
              }),
              ...(fields.requestDate && { requestDate: fields.requestDate }),
              ...(fields.requiredDate !== undefined && {
                requiredDate: fields.requiredDate || null,
              }),
              ...(fields.reference !== undefined && {
                reference: fields.reference || null,
              }),
              ...(fields.notes !== undefined && { notes: fields.notes || null }),
              ...(built && {
                subtotal: built.subtotal,
                taxTotal: built.taxTotal,
                total: built.total,
              }),
              updatedAt: new Date(),
            })
            .where(eq(purchaseRequisition.id, requisitionId))
            .returning();
          return row;
        });

        await db.insert(auditLog).values({
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          action: "update",
          entityType: "purchase_requisition",
          entityId: requisitionId,
          changes: { fields: Object.keys(fields).filter((k) => fields[k as keyof typeof fields] !== undefined) },
        });

        return { requisition: updated };
      })
  );

  // ─── Submit a purchase requisition for approval ─────────────────────
  server.tool(
    "submit_purchase_requisition",
    "Send a 'draft' requisition for approval, or resubmit a 'rejected' one after revising it (this clears the old rejection reason). Sets status to 'submitted', after which approve_purchase_requisition or reject_purchase_requisition can decide it. Returns the updated requisition.",
    {
      requisitionId: z
        .string()
        .describe("The UUID of the draft or rejected purchase requisition to submit"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:purchases");

        const existing = await db.query.purchaseRequisition.findFirst({
          where: and(
            eq(purchaseRequisition.id, params.requisitionId),
            eq(purchaseRequisition.organizationId, ctx.organizationId),
            notDeleted(purchaseRequisition.deletedAt)
          ),
        });
        if (!existing) throw new Error("Purchase requisition not found");

        const [updated] = await db
          .update(purchaseRequisition)
          .set({
            status: "submitted",
            rejectedAt: null,
            rejectionReason: null,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(purchaseRequisition.id, params.requisitionId),
              inArray(purchaseRequisition.status, ["draft", "rejected"])
            )
          )
          .returning();

        if (!updated)
          throw new Error("Only draft or rejected requisitions can be submitted");

        await db.insert(auditLog).values({
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          action: "submit",
          entityType: "purchase_requisition",
          entityId: params.requisitionId,
          changes: { previousStatus: existing.status },
        });

        return { requisition: updated };
      })
  );

  // ─── Approve a purchase requisition ─────────────────────────────────
  server.tool(
    "approve_purchase_requisition",
    "Approve a submitted purchase requisition. Sets status to 'approved' and records the approver. Only a 'submitted' requisition can be approved. Returns the updated requisition.",
    {
      requisitionId: z
        .string()
        .describe("The UUID of the purchase requisition to approve"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "approve:purchases");

        const [updated] = await db
          .update(purchaseRequisition)
          .set({
            status: "approved",
            approvedBy: ctx.userId,
            approvedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(purchaseRequisition.id, params.requisitionId),
              eq(purchaseRequisition.organizationId, ctx.organizationId),
              eq(purchaseRequisition.status, "submitted"),
              notDeleted(purchaseRequisition.deletedAt)
            )
          )
          .returning();

        if (!updated)
          throw new Error(
            "Purchase requisition not found (or it is not awaiting approval)"
          );

        await db.insert(auditLog).values({
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          action: "approve",
          entityType: "purchase_requisition",
          entityId: params.requisitionId,
          changes: { previousStatus: "submitted" },
        });

        return { requisition: updated };
      })
  );

  // ─── Reject a purchase requisition ──────────────────────────────────
  server.tool(
    "reject_purchase_requisition",
    "Reject a submitted purchase requisition. Sets status to 'rejected', stamps rejectedAt, and stores the optional reason. Only a 'submitted' requisition can be rejected. Returns the updated requisition.",
    {
      requisitionId: z
        .string()
        .describe("The UUID of the purchase requisition to reject"),
      reason: z
        .string()
        .optional()
        .describe("Optional reason for the rejection"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "approve:purchases");

        const [updated] = await db
          .update(purchaseRequisition)
          .set({
            status: "rejected",
            rejectedAt: new Date(),
            rejectionReason: params.reason || null,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(purchaseRequisition.id, params.requisitionId),
              eq(purchaseRequisition.organizationId, ctx.organizationId),
              eq(purchaseRequisition.status, "submitted"),
              notDeleted(purchaseRequisition.deletedAt)
            )
          )
          .returning();

        if (!updated)
          throw new Error(
            "Purchase requisition not found (or it is not awaiting approval)"
          );

        await db.insert(auditLog).values({
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          action: "reject",
          entityType: "purchase_requisition",
          entityId: params.requisitionId,
          changes: { previousStatus: "submitted" },
        });

        return { requisition: updated };
      })
  );

  // ─── Convert an approved requisition to a purchase order ────────────
  server.tool(
    "convert_purchase_requisition",
    "Convert an APPROVED purchase requisition into a purchase order (PO). Copies the requisition's contact, dates, reference, notes, totals, currency, and every line onto a new PO (assigned a PO number) and sets the requisition status to 'converted', linking the created PO. Only an 'approved' requisition can be converted, and it MUST have a supplier: either already set on the requisition or passed as contactId here (which also saves it on the requisition). Amounts are integer cents. Returns the created purchase order.",
    {
      requisitionId: z
        .string()
        .describe("The UUID of the approved purchase requisition to convert"),
      contactId: z
        .string()
        .optional()
        .describe("Supplier contact UUID to order from; required if the requisition has no supplier yet, otherwise overrides it"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:purchases");

        const req = await db.query.purchaseRequisition.findFirst({
          where: and(
            eq(purchaseRequisition.id, params.requisitionId),
            eq(purchaseRequisition.organizationId, ctx.organizationId),
            eq(purchaseRequisition.status, "approved"),
            notDeleted(purchaseRequisition.deletedAt)
          ),
          with: { lines: true },
        });

        if (!req) throw new Error("Approved purchase requisition not found");
        if (params.contactId) await assertOrgContact(params.contactId);
        const supplierId = params.contactId || req.contactId;
        if (!supplierId) {
          throw new Error(
            "Requisition has no supplier: pass contactId or set it with update_purchase_requisition"
          );
        }

        const poNumber = await getNextNumber(
          ctx.organizationId,
          "purchase_order",
          "po_number",
          "PO"
        );
        const today = new Date().toISOString().split("T")[0];

        const po = await db.transaction(async (tx) => {
          const [po] = await tx
            .insert(purchaseOrder)
            .values({
              organizationId: ctx.organizationId,
              contactId: supplierId,
              poNumber,
              issueDate: today,
              deliveryDate: req.requiredDate,
              reference: req.reference,
              notes: req.notes,
              subtotal: req.subtotal,
              taxTotal: req.taxTotal,
              total: req.total,
              currencyCode: req.currencyCode,
              createdBy: ctx.userId,
            })
            .returning();

          if (req.lines.length > 0) {
            await tx.insert(purchaseOrderLine).values(
              req.lines.map((l) => ({
                purchaseOrderId: po.id,
                description: l.description,
                quantity: l.quantity,
                unitPrice: l.unitPrice,
                accountId: l.accountId,
                taxRateId: l.taxRateId,
                taxAmount: l.taxAmount,
                amount: l.amount,
                sortOrder: l.sortOrder,
              }))
            );
          }

          await tx
            .update(purchaseRequisition)
            .set({
              status: "converted",
              contactId: supplierId,
              convertedPoId: po.id,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(purchaseRequisition.id, params.requisitionId),
                eq(purchaseRequisition.status, "approved")
              )
            );

          return po;
        });

        await db.insert(auditLog).values({
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          action: "convert",
          entityType: "purchase_requisition",
          entityId: params.requisitionId,
          changes: { previousStatus: "approved", purchaseOrderId: po.id },
        });

        return { purchaseOrder: po };
      })
  );
}
