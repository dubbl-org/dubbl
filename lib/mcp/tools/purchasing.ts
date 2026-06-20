import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  purchaseOrder,
  purchaseOrderLine,
  bill,
  billLine,
  billPurchaseOrder,
  goodsReceipt,
  goodsReceiptLine,
  procurementSettings,
  journalEntry,
  journalLine,
  inventoryItem,
  organization,
  auditLog,
} from "@/lib/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { notDeleted } from "@/lib/db/soft-delete";
import { requireRole } from "@/lib/api/require-role";
import { getNextNumber } from "@/lib/api/numbering";
import { decimalToMinorUnits, formatMoney } from "@/lib/money";
import { assertNotLocked } from "@/lib/api/period-lock";
import { preloadTaxRates, calcTax } from "@/lib/api/tax-calculator";
import { wrapTool } from "@/lib/mcp/errors";
import { sendDocumentEmail } from "@/lib/email/document-sender";
import {
  getNextEntryNumber,
  ensureControlAccount,
  resolveBaseRate,
} from "@/lib/api/journal-automation";
import {
  recordInventoryReceipt,
  type ValuedItem,
} from "@/lib/api/inventory-valuation";
import {
  getProcurementSettings,
  threeWayMatch,
  derivePurchaseOrderStatusAfterReceipt,
  derivePurchaseOrderStatusAfterBilling,
  resolveConvertLineAllocations,
  DEFAULT_PROCUREMENT_SETTINGS,
} from "@/lib/api/procurement";
import { buildSupplierStatement, NotASupplierError } from "@/lib/api/supplier-statement";
import {
  buildBatchRemittance,
  resolveBatchPaymentDate,
  type RemittanceGroup,
} from "@/lib/api/remittance";
import type { AuthContext } from "@/lib/api/auth-context";

function renderRemittanceHtml(
  orgName: string,
  group: RemittanceGroup,
  batchName: string,
  paymentDate: string,
  personalMessage?: string
): string {
  const formatDate = (d: string) => {
    const dt = new Date(d + "T00:00:00");
    return dt.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };
  const fmt = (cents: number) => formatMoney(cents, group.currencyCode);

  const rows = group.lines
    .map(
      (l) => `
      <tr>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:12px;">${formatDate(l.billDate)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:12px;">${l.billNumber}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:12px;">${l.billReference || "-"}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:12px;text-align:right;font-family:monospace;">${fmt(l.billTotal)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:12px;text-align:right;font-family:monospace;">${fmt(l.amountPaid)}</td>
      </tr>`
    )
    .join("\n");

  return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8" /></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111;padding:0;margin:0;">
  <div style="max-width:700px;margin:0 auto;padding:32px 20px;">
    <h1 style="font-size:20px;font-weight:700;margin:0 0 4px;">Remittance Advice</h1>
    <p style="font-size:13px;color:#666;margin:0 0 24px;">${orgName}</p>
    <table style="width:100%;margin-bottom:16px;" cellpadding="0" cellspacing="0">
      <tr>
        <td style="font-size:13px;"><strong>${group.contactName}</strong></td>
        <td style="font-size:12px;text-align:right;color:#666;">Payment date: ${formatDate(paymentDate)}</td>
      </tr>
    </table>
    ${
      personalMessage
        ? `<p style="font-size:13px;color:#525f7f;line-height:22px;margin:0 0 24px;white-space:pre-wrap;">${personalMessage}</p>`
        : ""
    }
    <p style="font-size:13px;color:#444;margin:0 0 16px;">
      The following bills have been paid${batchName ? ` (batch: ${batchName})` : ""}:
    </p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px;" cellpadding="0" cellspacing="0">
      <thead>
        <tr style="background:#f5f5f5;">
          <th style="padding:8px;text-align:left;font-size:10px;text-transform:uppercase;color:#888;font-weight:500;border-bottom:1px solid #ddd;">Bill Date</th>
          <th style="padding:8px;text-align:left;font-size:10px;text-transform:uppercase;color:#888;font-weight:500;border-bottom:1px solid #ddd;">Bill #</th>
          <th style="padding:8px;text-align:left;font-size:10px;text-transform:uppercase;color:#888;font-weight:500;border-bottom:1px solid #ddd;">Reference</th>
          <th style="padding:8px;text-align:right;font-size:10px;text-transform:uppercase;color:#888;font-weight:500;border-bottom:1px solid #ddd;">Bill Total</th>
          <th style="padding:8px;text-align:right;font-size:10px;text-transform:uppercase;color:#888;font-weight:500;border-bottom:1px solid #ddd;">Amount Paid</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
        <tr style="background:#f9f9f9;">
          <td colspan="4" style="padding:8px;font-size:12px;font-weight:600;border-bottom:1px solid #ddd;">Total Paid</td>
          <td style="padding:8px;font-size:12px;font-weight:600;text-align:right;font-family:monospace;border-bottom:1px solid #ddd;">${fmt(group.totalPaid)}</td>
        </tr>
      </tbody>
    </table>
    <p style="font-size:11px;color:#999;margin-top:24px;">
      This remittance advice was generated by ${orgName}.
    </p>
  </div>
</body>
</html>`;
}

/**
 * Accounts-payable / purchasing MCP tools (CANONICAL AP FILE): purchase orders,
 * goods receipts (GRN), PO->bill conversion (full or partial), three-way match,
 * procurement settings, supplier statements, and remittance advice (data + email).
 * This file consolidates the former procurement.ts and accounts-payable.ts.
 *
 * CONVENTIONS (matching the rest of the codebase):
 *  • MONETARY AMOUNTS are integer cents (e.g. $12.50 = 1250). Unit prices on
 *    create_purchase_order are DECIMAL numbers (e.g. 12.50) for convenience and
 *    are converted to cents internally.
 *  • QUANTITIES on inputs are WHOLE units (decimals allowed, e.g. 2.5) and are
 *    stored internally x100 (so 5 units = 500).
 *  • All tools are org-scoped via the AuthContext and use direct Drizzle access
 *    (no HTTP self-calls). Stock-moving tools post the matching double-entry
 *    journal so the GL and perpetual inventory stay in lock-step.
 */
export function registerPurchasingTools(server: McpServer, ctx: AuthContext) {
  // ─── Create a purchase order ────────────────────────────────────────
  server.tool(
    "create_purchase_order",
    "Create a purchase order (PO) for a supplier. Unit prices are decimal numbers (e.g. 12.50 for $12.50); the system computes line/tax totals and assigns a PO number automatically. Set inventoryItemId (and optionally warehouseId) on a line so a later goods receipt posts it to stock. The PO is created in draft; send it before receiving goods or billing.",
    {
      contactId: z.string().describe("Supplier contact UUID"),
      issueDate: z.string().describe("Issue date (YYYY-MM-DD)"),
      deliveryDate: z
        .string()
        .optional()
        .describe("Expected delivery date (YYYY-MM-DD)"),
      reference: z.string().optional().describe("Internal/supplier reference"),
      notes: z.string().optional().describe("PO notes"),
      currencyCode: z
        .string()
        .optional()
        .default("USD")
        .describe("Currency code (ISO 4217, e.g. USD)"),
      lines: z
        .array(
          z.object({
            description: z.string().describe("Line item description"),
            quantity: z
              .number()
              .optional()
              .default(1)
              .describe("Quantity ordered, in whole units (decimals allowed)"),
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
            discountPercent: z
              .number()
              .int()
              .min(0)
              .max(10000)
              .optional()
              .default(0)
              .describe("Discount in basis points (1000 = 10%)"),
            inventoryItemId: z
              .string()
              .optional()
              .describe(
                "Inventory item UUID. Marks the line as a stock order so a goods receipt against it posts to inventory."
              ),
            warehouseId: z
              .string()
              .optional()
              .describe("Warehouse UUID the stock is destined for (used with inventoryItemId)."),
          })
        )
        .min(1)
        .describe("Purchase order line items"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:bills");

        const poNumber = await getNextNumber(
          ctx.organizationId,
          "purchase_order",
          "po_number",
          "PO"
        );

        const taxRateIds = params.lines
          .map((l) => l.taxRateId)
          .filter(Boolean) as string[];
        const ratesMap = await preloadTaxRates(taxRateIds);

        let subtotal = 0;
        const processedLines = params.lines.map((l, i) => {
          const grossAmount = decimalToMinorUnits(l.quantity * l.unitPrice, params.currencyCode);
          const discountAmount = l.discountPercent
            ? Math.round((grossAmount * l.discountPercent) / 10000)
            : 0;
          const amount = grossAmount - discountAmount;
          subtotal += amount;
          const taxRateId = l.taxRateId ?? null;
          const taxAmount = taxRateId
            ? calcTax(amount, ratesMap.get(taxRateId) ?? 0)
            : 0;
          return {
            description: l.description,
            quantity: Math.round(l.quantity * 100),
            unitPrice: decimalToMinorUnits(l.unitPrice, params.currencyCode),
            accountId: l.accountId ?? null,
            taxRateId,
            taxAmount,
            amount,
            inventoryItemId: l.inventoryItemId ?? null,
            warehouseId: l.warehouseId ?? null,
            sortOrder: i,
          };
        });

        const taxTotal = processedLines.reduce((s, l) => s + l.taxAmount, 0);
        const total = subtotal + taxTotal;

        const [created] = await db
          .insert(purchaseOrder)
          .values({
            organizationId: ctx.organizationId,
            contactId: params.contactId,
            poNumber,
            issueDate: params.issueDate,
            deliveryDate: params.deliveryDate ?? null,
            reference: params.reference ?? null,
            notes: params.notes ?? null,
            subtotal,
            taxTotal,
            total,
            currencyCode: params.currencyCode,
            createdBy: ctx.userId,
          })
          .returning();

        await db.insert(purchaseOrderLine).values(
          processedLines.map((l) => ({
            purchaseOrderId: created.id,
            ...l,
          }))
        );

        await db.insert(auditLog).values({
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          action: "create",
          entityType: "purchase_order",
          entityId: created.id,
          changes: { poNumber, total },
        });

        return { purchaseOrder: created };
      })
  );

  // ─── List purchase orders ───────────────────────────────────────────
  server.tool(
    "list_purchase_orders",
    "List purchase orders with an optional status filter. Amounts are integer cents; quantities on lines are stored x100 (5 units = 500). Returns paginated POs with their supplier contact.",
    {
      status: z
        .enum(["draft", "sent", "partial", "received", "closed", "void"])
        .optional()
        .describe("Filter by purchase order status"),
      contactId: z
        .string()
        .optional()
        .describe("Filter to one supplier contact UUID"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .default(50)
        .describe("Number of purchase orders to return (max 100)"),
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
          eq(purchaseOrder.organizationId, ctx.organizationId),
          notDeleted(purchaseOrder.deletedAt),
        ];
        if (params.status) conditions.push(eq(purchaseOrder.status, params.status));
        if (params.contactId)
          conditions.push(eq(purchaseOrder.contactId, params.contactId));

        const offset = (params.page - 1) * params.limit;
        const purchaseOrders = await db.query.purchaseOrder.findMany({
          where: and(...conditions),
          orderBy: desc(purchaseOrder.createdAt),
          limit: params.limit,
          offset,
          with: { contact: true, lines: true },
        });

        const [countResult] = await db
          .select({ count: sql<number>`count(*)`.mapWith(Number) })
          .from(purchaseOrder)
          .where(and(...conditions));

        return {
          purchaseOrders,
          total: Number(countResult?.count ?? 0),
          page: params.page,
          limit: params.limit,
        };
      })
  );

  // ─── Receive goods (goods receipt / GRN) ────────────────────────────
  server.tool(
    "receive_goods_receipt",
    "Record a goods receipt (GRN) against a purchase order. For each stock line received it increments the PO line's received quantity, posts GRNI at the PO unit cost (DR Inventory 1300 / CR GRNI 2150), and brings stock on-hand via the perpetual inventory engine. Quantities are whole units (decimals allowed) and cannot exceed the outstanding (ordered minus already received) quantity. Returns the created goods receipt, the posted journal entry id (null if nothing valued), and the resulting PO status.",
    {
      purchaseOrderId: z
        .string()
        .describe("Purchase order UUID to receive against"),
      date: z.string().describe("Receipt date (YYYY-MM-DD)"),
      notes: z.string().optional().describe("Optional receipt notes"),
      lines: z
        .array(
          z.object({
            purchaseOrderLineId: z
              .string()
              .describe("PO line UUID being received"),
            quantity: z
              .number()
              .positive()
              .describe(
                "Quantity to receive now, in whole units (decimals allowed)"
              ),
          })
        )
        .min(1)
        .describe("Lines to receive against the purchase order"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:bills");
        await assertNotLocked(ctx.organizationId, params.date, ctx);

        const po = await db.query.purchaseOrder.findFirst({
          where: and(
            eq(purchaseOrder.id, params.purchaseOrderId),
            eq(purchaseOrder.organizationId, ctx.organizationId),
            notDeleted(purchaseOrder.deletedAt)
          ),
          with: { lines: true },
        });
        if (!po) throw new Error("Purchase order not found");
        if (po.status === "draft" || po.status === "void") {
          throw new Error(
            "Goods cannot be received against a draft or void purchase order"
          );
        }

        const lineById = new Map(po.lines.map((l) => [l.id, l]));
        const requested: {
          poLine: (typeof po.lines)[number];
          qtyUnits: number;
          qtyScaled: number;
        }[] = [];
        for (const r of params.lines) {
          const poLine = lineById.get(r.purchaseOrderLineId);
          if (!poLine)
            throw new Error(
              `PO line ${r.purchaseOrderLineId} not found on this purchase order`
            );
          const qtyScaled = Math.round(r.quantity * 100);
          if (qtyScaled <= 0) continue;
          const remaining = poLine.quantity - poLine.quantityReceived;
          if (qtyScaled > remaining) {
            throw new Error(
              `Receiving ${r.quantity} exceeds outstanding quantity (${
                remaining / 100
              }) on line "${poLine.description}"`
            );
          }
          requested.push({ poLine, qtyUnits: Math.round(r.quantity), qtyScaled });
        }
        if (requested.length === 0) throw new Error("No quantities to receive");

        const receiptNumber = await getNextNumber(
          ctx.organizationId,
          "goods_receipt",
          "receipt_number",
          "GRN"
        );

        const result = await db.transaction(async (tx) => {
          const { base } = await resolveBaseRate(
            ctx.organizationId,
            po.currencyCode,
            params.date
          );

          const [receipt] = await tx
            .insert(goodsReceipt)
            .values({
              organizationId: ctx.organizationId,
              purchaseOrderId: po.id,
              contactId: po.contactId,
              receiptNumber,
              date: params.date,
              status: "received",
              notes: params.notes ?? null,
              createdBy: ctx.userId,
            })
            .returning();

          const stockReceipts = requested.filter(
            (r) => r.poLine.inventoryItemId && r.qtyUnits > 0
          );
          let entryId: string | null = null;
          const legs: (typeof journalLine.$inferInsert)[] = [];

          if (stockReceipts.length > 0) {
            const entryNumber = await getNextEntryNumber(ctx.organizationId, tx);
            const [entry] = await tx
              .insert(journalEntry)
              .values({
                organizationId: ctx.organizationId,
                entryNumber,
                date: params.date,
                description: `Goods receipt ${receiptNumber} (PO ${po.poNumber})`,
                reference: receiptNumber,
                status: "posted",
                sourceType: "goods_receipt",
                postedAt: new Date(),
                createdBy: ctx.userId,
              })
              .returning();
            entryId = entry.id;

            const grniAcct = await ensureControlAccount(
              ctx.organizationId,
              "grni",
              base,
              tx
            );
            if (!grniAcct)
              throw new Error("Could not resolve GRNI control account");

            for (const r of stockReceipts) {
              const item = await tx.query.inventoryItem.findFirst({
                where: and(
                  eq(inventoryItem.id, r.poLine.inventoryItemId!),
                  eq(inventoryItem.organizationId, ctx.organizationId)
                ),
              });
              if (!item) continue;
              const invAcct =
                (item.inventoryAccountId
                  ? { id: item.inventoryAccountId }
                  : null) ??
                (await ensureControlAccount(
                  ctx.organizationId,
                  "inventory",
                  base,
                  tx
                ));
              if (!invAcct)
                throw new Error("Could not resolve Inventory control account");

              const unitCost = r.poLine.unitPrice;
              const value = unitCost * r.qtyUnits;

              await recordInventoryReceipt(tx, {
                item: item as ValuedItem,
                quantity: r.qtyUnits,
                unitCost,
                warehouseId: r.poLine.warehouseId,
                type: "purchase",
                referenceType: "goods_receipt",
                referenceId: receipt.id,
                createdBy: ctx.userId,
              });

              if (value !== 0) {
                legs.push(
                  {
                    journalEntryId: entry.id,
                    accountId: invAcct.id,
                    description: `Goods receipt ${receiptNumber}`,
                    debitAmount: value,
                    creditAmount: 0,
                    currencyCode: base,
                  },
                  {
                    journalEntryId: entry.id,
                    accountId: grniAcct.id,
                    description: `Goods receipt ${receiptNumber}`,
                    debitAmount: 0,
                    creditAmount: value,
                    currencyCode: base,
                  }
                );
              }
            }

            if (legs.length > 0) {
              await tx.insert(journalLine).values(legs);
            } else {
              await tx
                .delete(journalEntry)
                .where(eq(journalEntry.id, entry.id));
              entryId = null;
            }
          }

          for (let i = 0; i < requested.length; i++) {
            const r = requested[i];
            await tx.insert(goodsReceiptLine).values({
              goodsReceiptId: receipt.id,
              purchaseOrderLineId: r.poLine.id,
              inventoryItemId: r.poLine.inventoryItemId,
              warehouseId: r.poLine.warehouseId,
              description: r.poLine.description,
              quantityReceived: r.qtyScaled,
              unitCost: r.poLine.unitPrice,
              journalEntryId: r.poLine.inventoryItemId ? entryId : null,
              sortOrder: i,
            });
            await tx
              .update(purchaseOrderLine)
              .set({
                quantityReceived: r.poLine.quantityReceived + r.qtyScaled,
              })
              .where(eq(purchaseOrderLine.id, r.poLine.id));
          }

          const updatedLines = po.lines.map((l) => {
            const recv = requested.find((r) => r.poLine.id === l.id);
            return {
              quantity: l.quantity,
              quantityReceived: l.quantityReceived + (recv?.qtyScaled ?? 0),
            };
          });
          const newPoStatus = derivePurchaseOrderStatusAfterReceipt(updatedLines);
          if (po.status !== "closed") {
            await tx
              .update(purchaseOrder)
              .set({ status: newPoStatus, updatedAt: new Date() })
              .where(eq(purchaseOrder.id, po.id));
          }

          await tx.insert(auditLog).values({
            organizationId: ctx.organizationId,
            userId: ctx.userId,
            action: "create",
            entityType: "goods_receipt",
            entityId: receipt.id,
            changes: { purchaseOrderId: po.id, journalEntryId: entryId, receiptNumber },
          });

          return { receiptId: receipt.id, entryId, newPoStatus };
        });

        const created = await db.query.goodsReceipt.findFirst({
          where: eq(goodsReceipt.id, result.receiptId),
          with: { lines: true, contact: true },
        });

        return {
          goodsReceipt: created,
          journalEntryId: result.entryId,
          purchaseOrderStatus: result.newPoStatus,
        };
      })
  );

  // ─── List goods receipts ────────────────────────────────────────────
  server.tool(
    "list_purchase_goods_receipts",
    "List goods receipts (GRNs), optionally filtered by purchase order or status. Quantities are stored x100 (5 units = 500); unit costs are integer cents. Returns paginated receipts with their lines and supplier contact.",
    {
      purchaseOrderId: z
        .string()
        .optional()
        .describe("Filter to one purchase order UUID"),
      status: z
        .enum(["draft", "received", "billed", "void"])
        .optional()
        .describe("Filter by goods-receipt status"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .default(50)
        .describe("Number of receipts to return (max 100)"),
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
          eq(goodsReceipt.organizationId, ctx.organizationId),
          notDeleted(goodsReceipt.deletedAt),
        ];
        if (params.purchaseOrderId)
          conditions.push(
            eq(goodsReceipt.purchaseOrderId, params.purchaseOrderId)
          );
        if (params.status) conditions.push(eq(goodsReceipt.status, params.status));

        const offset = (params.page - 1) * params.limit;
        const rows = await db.query.goodsReceipt.findMany({
          where: and(...conditions),
          orderBy: desc(goodsReceipt.createdAt),
          limit: params.limit,
          offset,
          with: { lines: true, contact: true },
        });
        const [countResult] = await db
          .select({ count: sql<number>`count(*)`.mapWith(Number) })
          .from(goodsReceipt)
          .where(and(...conditions));

        return {
          goodsReceipts: rows,
          total: Number(countResult?.count ?? 0),
          page: params.page,
          limit: params.limit,
        };
      })
  );

  // ─── Convert a PO to a bill (full or partial) ───────────────────────
  server.tool(
    "convert_po_to_bill",
    "Create a bill from a purchase order. Omit `lines` to bill the entire un-billed remainder (full convert). Provide `lines` with per-line quantities (whole units) to bill only part of the PO — a PO can be billed across MULTIPLE bills. Increments each PO line's billed quantity, records the PO<->bill link, copies stock/inventory dimensions onto the bill lines, and sets the PO status to partial (some billed) or closed (fully billed). Quantity already goods-received is linked to its goods-receipt line so the bill CLEARS GRNI instead of re-capitalising stock (no double-counting); only un-received quantity capitalises fresh. Amounts are integer cents.",
    {
      purchaseOrderId: z.string().describe("Purchase order UUID to convert"),
      lines: z
        .array(
          z.object({
            purchaseOrderLineId: z.string().describe("PO line UUID to bill"),
            quantity: z
              .number()
              .positive()
              .describe(
                "Quantity to bill now, in whole units (cannot exceed the un-billed quantity)"
              ),
          })
        )
        .optional()
        .describe(
          "Per-line quantities to bill. Omit to bill the entire remaining quantity on every line."
        ),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:bills");

        const found = await db.query.purchaseOrder.findFirst({
          where: and(
            eq(purchaseOrder.id, params.purchaseOrderId),
            eq(purchaseOrder.organizationId, ctx.organizationId),
            notDeleted(purchaseOrder.deletedAt)
          ),
          with: { lines: true },
        });
        if (!found) throw new Error("Purchase order not found");
        if (
          found.status === "draft" ||
          found.status === "void" ||
          found.status === "closed"
        ) {
          throw new Error(
            "Purchase order cannot be converted in its current status"
          );
        }

        const isPartial = !!params.lines;
        if (!isPartial && found.convertedBillId) {
          throw new Error(
            "Purchase order has already been converted to a bill"
          );
        }

        const lineById = new Map(found.lines.map((l) => [l.id, l]));
        type Item = { poLine: (typeof found.lines)[number]; qtyScaled: number };
        const items: Item[] = [];

        if (isPartial) {
          for (const r of params.lines!) {
            const poLine = lineById.get(r.purchaseOrderLineId);
            if (!poLine)
              throw new Error(
                `PO line ${r.purchaseOrderLineId} not found on this purchase order`
              );
            const qtyScaled = Math.round(r.quantity * 100);
            if (qtyScaled <= 0) continue;
            const remaining = poLine.quantity - poLine.quantityBilled;
            if (qtyScaled > remaining) {
              throw new Error(
                `Billing ${r.quantity} exceeds un-billed quantity (${
                  remaining / 100
                }) on line "${poLine.description}"`
              );
            }
            items.push({ poLine, qtyScaled });
          }
          if (items.length === 0) throw new Error("No quantities to bill");
        } else {
          for (const poLine of found.lines) {
            const remaining = poLine.quantity - poLine.quantityBilled;
            if (remaining <= 0) continue;
            items.push({ poLine, qtyScaled: remaining });
          }
          if (items.length === 0)
            throw new Error("Purchase order is already fully billed");
        }

        const billNumber = await getNextNumber(
          ctx.organizationId,
          "bill",
          "bill_number",
          "BILL"
        );

        // Split each PO line's billed quantity into a GRN-matched portion
        // (already goods-received → the bill must CLEAR GRNI, not re-capitalise
        // stock) and an un-received remainder (capitalised fresh). Without this,
        // converting a goods-received PO double-counts inventory and strands
        // GRNI — matching the REST convert route's behavior.
        const allocations = await resolveConvertLineAllocations(
          ctx.organizationId,
          items.map((it) => ({
            purchaseOrderLineId: it.poLine.id,
            quantity: it.poLine.quantity,
            quantityReceived: it.poLine.quantityReceived,
            quantityBilled: it.poLine.quantityBilled,
            quantityToBill: it.qtyScaled,
          }))
        );

        const result = await db.transaction(async (tx) => {
          // Each PO line may emit MULTIPLE bill lines (one per matched /
          // unmatched slice); slice amounts/tax are pro-rated by quantity with
          // the last slice absorbing the rounding residual so totals stay exact.
          const billLines: {
            description: string;
            quantity: number;
            unitPrice: number;
            accountId: string | null;
            taxRateId: string | null;
            taxAmount: number;
            amount: number;
            inventoryItemId: string | null;
            warehouseId: string | null;
            goodsReceiptLineId: string | null;
            sortOrder: number;
          }[] = [];

          let sortOrder = 0;
          for (const it of items) {
            const lineQtyRatio =
              it.poLine.quantity > 0 ? it.qtyScaled / it.poLine.quantity : 1;
            const lineAmount = Math.round(
              it.poLine.unitPrice * (it.qtyScaled / 100)
            );
            const lineTax = Math.round(it.poLine.taxAmount * lineQtyRatio);

            const slices = allocations.get(it.poLine.id) ?? [
              { goodsReceiptLineId: null, quantityX100: it.qtyScaled },
            ];

            let amountAllocated = 0;
            let taxAllocated = 0;
            slices.forEach((slice, si) => {
              const isLast = si === slices.length - 1;
              const amount = isLast
                ? lineAmount - amountAllocated
                : Math.round(it.poLine.unitPrice * (slice.quantityX100 / 100));
              const taxAmount = isLast
                ? lineTax - taxAllocated
                : Math.round((lineTax * slice.quantityX100) / it.qtyScaled);
              amountAllocated += amount;
              taxAllocated += taxAmount;
              billLines.push({
                description: it.poLine.description,
                quantity: slice.quantityX100,
                unitPrice: it.poLine.unitPrice,
                accountId: it.poLine.accountId,
                taxRateId: it.poLine.taxRateId,
                taxAmount,
                amount,
                inventoryItemId: it.poLine.inventoryItemId,
                warehouseId: it.poLine.warehouseId,
                // Link GRN-matched slices so the bill posting CLEARS GRNI (+ PPV)
                // instead of re-capitalising stock already on hand from the GRN.
                goodsReceiptLineId: slice.goodsReceiptLineId,
                sortOrder: sortOrder++,
              });
            });
          }

          const subtotal = billLines.reduce((s, l) => s + l.amount, 0);
          const taxTotal = billLines.reduce((s, l) => s + l.taxAmount, 0);
          const total = subtotal + taxTotal;

          const [createdBill] = await tx
            .insert(bill)
            .values({
              organizationId: ctx.organizationId,
              contactId: found.contactId,
              billNumber,
              issueDate: found.issueDate,
              dueDate: found.deliveryDate || found.issueDate,
              reference: found.reference,
              notes: found.notes,
              subtotal,
              taxTotal,
              total,
              amountPaid: 0,
              amountDue: total,
              currencyCode: found.currencyCode,
              createdBy: ctx.userId,
            })
            .returning();

          await tx
            .insert(billLine)
            .values(billLines.map((l) => ({ billId: createdBill.id, ...l })));

          await tx
            .insert(billPurchaseOrder)
            .values({ billId: createdBill.id, purchaseOrderId: found.id })
            .onConflictDoNothing();

          for (const it of items) {
            await tx
              .update(purchaseOrderLine)
              .set({
                quantityBilled: it.poLine.quantityBilled + it.qtyScaled,
              })
              .where(eq(purchaseOrderLine.id, it.poLine.id));
          }

          const updatedLines = found.lines.map((l) => {
            const it = items.find((x) => x.poLine.id === l.id);
            return {
              quantity: l.quantity,
              quantityBilled: l.quantityBilled + (it?.qtyScaled ?? 0),
            };
          });
          const newStatus = derivePurchaseOrderStatusAfterBilling(updatedLines);

          await tx
            .update(purchaseOrder)
            .set({
              status: newStatus,
              convertedBillId: found.convertedBillId ?? createdBill.id,
              updatedAt: new Date(),
            })
            .where(eq(purchaseOrder.id, found.id));

          await tx.insert(auditLog).values({
            organizationId: ctx.organizationId,
            userId: ctx.userId,
            action: "convert",
            entityType: "purchase_order",
            entityId: found.id,
            changes: {
              billId: createdBill.id,
              newStatus,
              partial: isPartial,
            },
          });

          return { bill: createdBill, newStatus };
        });

        return {
          bill: result.bill,
          purchaseOrderStatus: result.newStatus,
        };
      })
  );

  // ─── Supplier (AP) statement ────────────────────────────────────────
  server.tool(
    "get_purchasing_supplier_statement",
    "Get an accounts-payable statement for a supplier contact over a date range: bills (increase what we owe), debit notes (reduce it), and payments made (reduce it), with a running balance of what we owe the supplier (positive = we owe them). Date params are YYYY-MM-DD and default to the last 12 months. All amounts are integer cents. Errors if the contact is not a supplier.",
    {
      contactId: z.string().describe("Supplier contact UUID"),
      startDate: z
        .string()
        .optional()
        .describe("Start of the period (YYYY-MM-DD); defaults to 12 months ago"),
      endDate: z
        .string()
        .optional()
        .describe("End of the period (YYYY-MM-DD); defaults to today"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        try {
          const statement = await buildSupplierStatement(
            ctx.organizationId,
            params.contactId,
            params.startDate,
            params.endDate
          );
          if (!statement) throw new Error("Contact not found");
          return { statement };
        } catch (err) {
          if (err instanceof NotASupplierError) {
            throw new Error(err.message);
          }
          throw err;
        }
      })
  );

  // ─── Generate remittance advice for a payment batch ─────────────────
  server.tool(
    "generate_remittance",
    "Generate remittance advice for a payment batch: groups the batch's paid items by supplier and lists, per supplier, which bills were paid and the amount applied to each. All amounts are integer cents. This returns the structured remittance data (it does not email it). Optionally filter to a single supplier with contactId.",
    {
      paymentBatchId: z.string().describe("Payment batch UUID"),
      contactId: z
        .string()
        .optional()
        .describe("Optional: return only the remittance for this supplier contact UUID"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:payments");

        const result = await buildBatchRemittance(
          ctx.organizationId,
          params.paymentBatchId
        );
        if (!result) throw new Error("Payment batch not found");

        let groups = result.groups;
        if (params.contactId) {
          groups = groups.filter((g) => g.contactId === params.contactId);
          if (groups.length === 0) {
            throw new Error(
              "No remittance found for the given contact in this batch"
            );
          }
        }

        const paymentDate = resolveBatchPaymentDate(result.batch);

        return {
          batch: {
            id: result.batch.id,
            name: result.batch.name,
            status: result.batch.status,
            totalAmount: result.batch.totalAmount,
            paymentCount: result.batch.paymentCount,
            paymentDate,
          },
          remittances: groups,
        };
      })
  );

  // ─── Email remittance advice for a payment batch ────────────────────
  server.tool(
    "send_payment_batch_remittance",
    "Email remittance advices for a payment batch to suppliers. By default emails every supplier in the batch that has an email address; pass contactId to send to only one supplier. Returns which suppliers were sent and which were skipped (e.g. no email on file). Suppliers without an email are skipped, not errored.",
    {
      batchId: z.string().describe("The UUID of the payment batch"),
      contactId: z
        .string()
        .optional()
        .describe(
          "If set, only email the remittance for this one supplier; otherwise all suppliers in the batch are emailed"
        ),
      personalMessage: z
        .string()
        .optional()
        .describe("Optional message included at the top of the remittance email"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:payments");

        const result = await buildBatchRemittance(
          ctx.organizationId,
          params.batchId
        );
        if (!result) throw new Error("Payment batch not found");

        const org = await db.query.organization.findFirst({
          where: eq(organization.id, ctx.organizationId),
        });
        const orgName = org?.name || "Organization";
        const paymentDate = resolveBatchPaymentDate(result.batch);

        let groups = result.groups;
        if (params.contactId) {
          groups = groups.filter((g) => g.contactId === params.contactId);
          if (!groups.length) {
            throw new Error(
              "No remittance found for the given contact in this batch"
            );
          }
        }

        const sent: Array<{ contactId: string; recipientEmail: string }> = [];
        const skipped: Array<{ contactId: string; reason: string }> = [];

        for (const group of groups) {
          if (!group.contactEmail) {
            skipped.push({
              contactId: group.contactId,
              reason: "Supplier has no email address",
            });
            continue;
          }

          const html = renderRemittanceHtml(
            orgName,
            group,
            result.batch.name,
            paymentDate,
            params.personalMessage
          );

          await sendDocumentEmail({
            orgId: ctx.organizationId,
            userId: ctx.userId,
            documentType: "remittance_advice",
            documentId: params.batchId,
            recipientEmail: group.contactEmail,
            subject: `Remittance advice from ${orgName} — ${formatMoney(group.totalPaid, group.currencyCode)}`,
            body: html,
            attachPdf: false,
            replyTo: org?.contactEmail || undefined,
          });

          sent.push({
            contactId: group.contactId,
            recipientEmail: group.contactEmail,
          });
        }

        return { success: true, sent, skipped };
      })
  );

  // ─── Three-way-match preview ────────────────────────────────────────
  server.tool(
    "three_way_match_purchase_order",
    "Run a three-way match on a purchase order: compare ordered (PO) vs received (GRN) vs billed quantities and prices against the org's procurement tolerances. Optionally pass a proposed bill (`billLines` with quantities in whole units and optional unitPrice in cents) to evaluate before billing. Returns per-line status (matched/warning/blocked), variances, and an overall status. No changes are made.",
    {
      purchaseOrderId: z.string().describe("Purchase order UUID to evaluate"),
      billLines: z
        .array(
          z.object({
            purchaseOrderLineId: z.string().describe("PO line UUID"),
            quantity: z.number().positive().describe("Proposed quantity to bill, in whole units"),
            unitPrice: z.number().int().min(0).optional().describe("Proposed bill unit price in cents (defaults to the PO price)"),
          })
        )
        .optional()
        .describe("Proposed bill lines to evaluate. Omit to evaluate the current ordered/received/billed state only."),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const po = await db.query.purchaseOrder.findFirst({
          where: and(
            eq(purchaseOrder.id, params.purchaseOrderId),
            eq(purchaseOrder.organizationId, ctx.organizationId),
            notDeleted(purchaseOrder.deletedAt)
          ),
          with: { lines: true },
        });
        if (!po) throw new Error("Purchase order not found");

        const settings = await getProcurementSettings(ctx.organizationId);
        const proposedById = new Map(
          (params.billLines ?? []).map((b) => [b.purchaseOrderLineId, b])
        );

        const matchInput = po.lines.map((l) => {
          const proposed = proposedById.get(l.id);
          return {
            purchaseOrderLineId: l.id,
            description: l.description,
            quantityOrdered: l.quantity,
            quantityReceived: l.quantityReceived,
            quantityBilled: l.quantityBilled,
            quantityToBill: proposed ? Math.round(proposed.quantity * 100) : 0,
            unitPriceOrdered: l.unitPrice,
            unitPriceBilled: proposed?.unitPrice ?? l.unitPrice,
          };
        });

        return { match: threeWayMatch(matchInput, settings), settings };
      })
  );

  // ─── Get procurement settings ───────────────────────────────────────
  server.tool(
    "get_procurement_settings",
    "Get the org's procurement (three-way-match) settings. Tolerances are in basis points (500 = 5%). requireGrnBeforeBill blocks billing un-received goods; blockOverBill blocks billing beyond the ordered quantity. Returns safe defaults (no tolerance, nothing blocked) when never configured.",
    {},
    () =>
      wrapTool(ctx, async () => {
        const existing = await db.query.procurementSettings.findFirst({
          where: eq(procurementSettings.organizationId, ctx.organizationId),
        });
        return {
          procurementSettings:
            existing ?? { organizationId: ctx.organizationId, ...DEFAULT_PROCUREMENT_SETTINGS },
        };
      })
  );

  // ─── Update procurement settings ────────────────────────────────────
  server.tool(
    "update_procurement_settings",
    "Update the org's procurement (three-way-match) settings (upsert). Tolerances are in basis points (500 = 5%). Only provided fields are changed.",
    {
      priceTolerancePercent: z.number().int().min(0).max(100000).optional().describe("Price tolerance in basis points (500 = 5%)"),
      qtyTolerancePercent: z.number().int().min(0).max(100000).optional().describe("Quantity tolerance in basis points (500 = 5%)"),
      requireGrnBeforeBill: z.boolean().optional().describe("Block billing goods that have not been received via a GRN"),
      blockOverBill: z.boolean().optional().describe("Block billing beyond the ordered quantity"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:bills");

        const existing = await db.query.procurementSettings.findFirst({
          where: eq(procurementSettings.organizationId, ctx.organizationId),
        });

        let saved;
        if (existing) {
          [saved] = await db
            .update(procurementSettings)
            .set({
              ...(params.priceTolerancePercent !== undefined && { priceTolerancePercent: params.priceTolerancePercent }),
              ...(params.qtyTolerancePercent !== undefined && { qtyTolerancePercent: params.qtyTolerancePercent }),
              ...(params.requireGrnBeforeBill !== undefined && { requireGrnBeforeBill: params.requireGrnBeforeBill }),
              ...(params.blockOverBill !== undefined && { blockOverBill: params.blockOverBill }),
              updatedAt: new Date(),
            })
            .where(eq(procurementSettings.organizationId, ctx.organizationId))
            .returning();
        } else {
          [saved] = await db
            .insert(procurementSettings)
            .values({
              organizationId: ctx.organizationId,
              priceTolerancePercent: params.priceTolerancePercent ?? DEFAULT_PROCUREMENT_SETTINGS.priceTolerancePercent,
              qtyTolerancePercent: params.qtyTolerancePercent ?? DEFAULT_PROCUREMENT_SETTINGS.qtyTolerancePercent,
              requireGrnBeforeBill: params.requireGrnBeforeBill ?? DEFAULT_PROCUREMENT_SETTINGS.requireGrnBeforeBill,
              blockOverBill: params.blockOverBill ?? DEFAULT_PROCUREMENT_SETTINGS.blockOverBill,
            })
            .returning();
        }

        return { procurementSettings: saved };
      })
  );
}
