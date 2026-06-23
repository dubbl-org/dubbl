import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  purchaseRequisition,
  purchaseRequisitionLine,
  purchaseOrder,
  purchaseOrderLine,
  auditLog,
} from "@/lib/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { notDeleted } from "@/lib/db/soft-delete";
import { requireRole } from "@/lib/api/require-role";
import { getNextNumber } from "@/lib/api/numbering";
import { wrapTool } from "@/lib/mcp/errors";
import type { AuthContext } from "@/lib/api/auth-context";

/**
 * MCP tools for purchase requisitions — an internal request to buy that flows
 * draft -> submitted -> approved/rejected, and once approved can be CONVERTED
 * into a purchase order (PO).
 *
 * MONEY/QUANTITY conventions (mirroring the REST routes):
 *  • create_purchase_requisition takes unitPrice as a DECIMAL number (e.g. 12.50
 *    for $12.50) and quantity in WHOLE units (decimals allowed); both are stored
 *    internally as integers (unitPrice x100 = cents, quantity x100). Line amount
 *    is computed as quantity * unitPrice and stored in integer cents.
 *  • All amounts in RESULTS are integer cents; stored quantities are x100
 *    (5 units = 500). Requisitions carry NO tax (taxTotal is 0).
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
    "Get a single purchase requisition by ID, including its line items and contact. Amounts are integer cents; line quantities are stored x100 (5 units = 500).",
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
          with: { contact: true, lines: true },
        });
        if (!found) throw new Error("Purchase requisition not found");
        return { requisition: found };
      })
  );

  // ─── Create a purchase requisition ──────────────────────────────────
  server.tool(
    "create_purchase_requisition",
    "Create a draft purchase requisition (an internal request to buy) with line items. unitPrice is a DECIMAL number (e.g. 12.50 for $12.50); quantity is in whole units (decimals allowed). The system computes each line amount (quantity * unitPrice) in integer cents and assigns a requisition number (REQ). A contact (supplier) is optional at this stage but is REQUIRED before the requisition can be converted to a PO. Requisitions carry no tax (taxTotal is 0). The requisition starts in 'draft'. Returns the created requisition.",
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
        .array(
          z.object({
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
              .describe("Unit price as a decimal (e.g. 12.50 for $12.50)"),
            accountId: z
              .string()
              .optional()
              .describe("Expense/asset account UUID for this line"),
            taxRateId: z.string().optional().describe("Tax rate UUID"),
          })
        )
        .min(1)
        .describe("Purchase requisition line items (at least one)"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:purchases");

        const requisitionNumber = await getNextNumber(
          ctx.organizationId,
          "purchase_requisition",
          "requisition_number",
          "REQ"
        );

        // Mirror the REST route's storage/amount math: amount = quantity *
        // unitPrice in cents; quantity and unitPrice stored x100. Requisitions
        // carry no tax (taxAmount/taxTotal are 0).
        let subtotal = 0;
        const processedLines = params.lines.map((l, i) => {
          const amount = Math.round(l.quantity * l.unitPrice * 100);
          subtotal += amount;
          return {
            description: l.description,
            quantity: Math.round(l.quantity * 100),
            unitPrice: Math.round(l.unitPrice * 100),
            accountId: l.accountId || null,
            taxRateId: l.taxRateId || null,
            taxAmount: 0,
            amount,
            sortOrder: i,
          };
        });

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
            taxTotal: 0,
            total: subtotal,
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
          changes: { requisitionNumber, total: subtotal },
        });

        return { requisition: created };
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
    "Convert an APPROVED purchase requisition into a purchase order (PO). Copies the requisition's contact, dates, reference, notes, totals, currency, and every line onto a new PO (assigned a PO number) and sets the requisition status to 'converted', linking the created PO. Only an 'approved' requisition can be converted, and it MUST have a contact (supplier). Amounts are integer cents. Returns the created purchase order.",
    {
      requisitionId: z
        .string()
        .describe("The UUID of the approved purchase requisition to convert"),
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
        if (!req.contactId) {
          throw new Error("Requisition must have a contact to convert");
        }

        const poNumber = await getNextNumber(
          ctx.organizationId,
          "purchase_order",
          "po_number",
          "PO"
        );
        const today = new Date().toISOString().split("T")[0];

        const [po] = await db
          .insert(purchaseOrder)
          .values({
            organizationId: ctx.organizationId,
            contactId: req.contactId,
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
          await db.insert(purchaseOrderLine).values(
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

        await db
          .update(purchaseRequisition)
          .set({
            status: "converted",
            convertedPoId: po.id,
            updatedAt: new Date(),
          })
          .where(eq(purchaseRequisition.id, params.requisitionId));

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
