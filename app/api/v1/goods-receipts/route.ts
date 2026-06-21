import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  goodsReceipt,
  goodsReceiptLine,
  purchaseOrder,
  purchaseOrderLine,
  journalEntry,
  journalLine,
  inventoryItem,
} from "@/lib/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound, validationError } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { parsePagination, paginatedResponse } from "@/lib/api/pagination";
import { getNextNumber } from "@/lib/api/numbering";
import { assertNotLocked } from "@/lib/api/period-lock";
import { logAudit } from "@/lib/api/audit";
import {
  getNextEntryNumber,
  ensureControlAccount,
  resolveBaseRate,
  assertBaseRateAvailable,
} from "@/lib/api/journal-automation";
import {
  recordInventoryReceipt,
  type ValuedItem,
} from "@/lib/api/inventory-valuation";
import { derivePurchaseOrderStatusAfterReceipt } from "@/lib/api/procurement";
import { z } from "zod";

/**
 * Goods Receipt (GRN). Records the physical receipt of goods against a purchase
 * order. For each stock line received it:
 *   • creates goodsReceipt + goodsReceiptLine rows (quantities x100, costs cents)
 *   • increments purchaseOrderLine.quantityReceived
 *   • posts GRNI at PO unit cost: DR Inventory (1300) / CR GRNI (2150)
 *   • brings perpetual stock on-hand via the inventory-valuation engine
 *   • stamps the journalEntryId on each posted goods-receipt line
 * The PO status is recomputed from cumulative received quantity
 * (sent / partial / received).
 */
const receiveLineSchema = z.object({
  purchaseOrderLineId: z.string().min(1).describe("PO line being received against"),
  // Quantity to receive now, in WHOLE units (decimal allowed e.g. 2.5).
  quantity: z.number().positive(),
});

const createSchema = z.object({
  purchaseOrderId: z.string().min(1),
  date: z.string().min(1),
  notes: z.string().nullable().optional(),
  lines: z.array(receiveLineSchema).min(1),
});

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const url = new URL(request.url);
    const { page, limit, offset } = parsePagination(url);
    const status = url.searchParams.get("status");
    const purchaseOrderId = url.searchParams.get("purchaseOrderId");

    const conditions = [
      eq(goodsReceipt.organizationId, ctx.organizationId),
      notDeleted(goodsReceipt.deletedAt),
    ];
    if (status) {
      conditions.push(
        eq(goodsReceipt.status, status as typeof goodsReceipt.status.enumValues[number])
      );
    }
    if (purchaseOrderId) {
      conditions.push(eq(goodsReceipt.purchaseOrderId, purchaseOrderId));
    }

    const receipts = await db.query.goodsReceipt.findMany({
      where: and(...conditions),
      orderBy: desc(goodsReceipt.createdAt),
      limit,
      offset,
      with: { contact: true, lines: true },
    });

    const [countResult] = await db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(goodsReceipt)
      .where(and(...conditions));

    return NextResponse.json(
      paginatedResponse(receipts, Number(countResult?.count || 0), page, limit)
    );
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:bills");

    const body = await request.json();
    const parsed = createSchema.parse(body);

    await assertNotLocked(ctx.organizationId, parsed.date, ctx);

    const po = await db.query.purchaseOrder.findFirst({
      where: and(
        eq(purchaseOrder.id, parsed.purchaseOrderId),
        eq(purchaseOrder.organizationId, ctx.organizationId),
        notDeleted(purchaseOrder.deletedAt)
      ),
      with: { lines: true },
    });

    if (!po) return notFound("Purchase order");
    if (po.status === "draft" || po.status === "void") {
      return validationError("Goods cannot be received against a draft or void purchase order");
    }

    // Pre-flight: a foreign-currency PO must have a base rate on the receipt date
    // so the GRNI entry converts cleanly (422 with no partial writes) rather than
    // failing part-way through the transaction.
    await assertBaseRateAvailable(ctx.organizationId, po.currencyCode, parsed.date);

    const lineById = new Map(po.lines.map((l) => [l.id, l]));

    // Validate each requested line belongs to the PO and does not over-receive.
    const requested: {
      poLine: typeof po.lines[number];
      qtyUnits: number; // whole units
      qtyScaled: number; // x100
    }[] = [];
    for (const r of parsed.lines) {
      const poLine = lineById.get(r.purchaseOrderLineId);
      if (!poLine) {
        return validationError(`PO line ${r.purchaseOrderLineId} not found on this purchase order`);
      }
      // Perpetual inventory tracks whole units, so a fractional receipt for a
      // stock line would book rounded units (e.g. 2.5 → 3) while the PO tracks
      // the exact 2.5 — leaving inventory and the PO permanently out of step and
      // mis-valuing the stock. Require whole units for stock lines.
      if (poLine.inventoryItemId && !Number.isInteger(r.quantity)) {
        return validationError(
          `"${poLine.description}" is a stock item — receive it in whole units.`
        );
      }
      const qtyScaled = Math.round(r.quantity * 100);
      if (qtyScaled <= 0) continue;
      const remaining = poLine.quantity - poLine.quantityReceived;
      if (qtyScaled > remaining) {
        return validationError(
          `Receiving ${r.quantity} exceeds outstanding quantity (${remaining / 100}) on line "${poLine.description}"`
        );
      }
      requested.push({ poLine, qtyUnits: Math.round(r.quantity), qtyScaled });
    }

    if (requested.length === 0) {
      return validationError("No quantities to receive");
    }

    const receiptNumber = await getNextNumber(
      ctx.organizationId,
      "goods_receipt",
      "receipt_number",
      "GRN"
    );

    const result = await db.transaction(async (tx) => {
      const { base } = await resolveBaseRate(ctx.organizationId, po.currencyCode, parsed.date);

      // Header.
      const [receipt] = await tx
        .insert(goodsReceipt)
        .values({
          organizationId: ctx.organizationId,
          purchaseOrderId: po.id,
          contactId: po.contactId,
          receiptNumber,
          date: parsed.date,
          status: "received",
          notes: parsed.notes ?? null,
          createdBy: ctx.userId,
        })
        .returning();

      // GRNI posting (one entry for all stock lines on this receipt).
      const stockReceipts = requested.filter(
        (r) => r.poLine.inventoryItemId && r.qtyUnits > 0
      );

      let entryId: string | null = null;
      const grniLegs: (typeof journalLine.$inferInsert)[] = [];
      let grniTotal = 0;

      if (stockReceipts.length > 0) {
        const entryNumber = await getNextEntryNumber(ctx.organizationId, tx);
        const [entry] = await tx
          .insert(journalEntry)
          .values({
            organizationId: ctx.organizationId,
            entryNumber,
            date: parsed.date,
            description: `Goods receipt ${receiptNumber} (PO ${po.poNumber})`,
            reference: receiptNumber,
            status: "posted",
            sourceType: "goods_receipt",
            postedAt: new Date(),
            createdBy: ctx.userId,
          })
          .returning();
        entryId = entry.id;

        const grniAcct = await ensureControlAccount(ctx.organizationId, "grni", base, tx);
        if (!grniAcct) throw new Error("Could not resolve GRNI control account");

        for (const r of stockReceipts) {
          const item = await tx.query.inventoryItem.findFirst({
            where: and(
              eq(inventoryItem.id, r.poLine.inventoryItemId!),
              eq(inventoryItem.organizationId, ctx.organizationId)
            ),
          });
          if (!item) continue;

          const invAcct =
            (item.inventoryAccountId ? { id: item.inventoryAccountId } : null) ??
            (await ensureControlAccount(ctx.organizationId, "inventory", base, tx));
          if (!invAcct) throw new Error("Could not resolve Inventory control account");

          const unitCost = r.poLine.unitPrice; // PO unit cost (cents)
          const value = unitCost * r.qtyUnits;
          grniTotal += value;

          // Perpetual stock receipt (no GL — posted here).
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
            grniLegs.push(
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

        if (grniLegs.length > 0) {
          await tx.insert(journalLine).values(grniLegs);
        } else {
          // No value to post (all zero-cost) — drop the empty header.
          await tx.delete(journalEntry).where(eq(journalEntry.id, entry.id));
          entryId = null;
        }
      }

      // Insert goods-receipt lines and bump PO line received tallies.
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
          .set({ quantityReceived: r.poLine.quantityReceived + r.qtyScaled })
          .where(eq(purchaseOrderLine.id, r.poLine.id));
      }

      // Recompute PO status from cumulative received quantity.
      const updatedLines = po.lines.map((l) => {
        const recv = requested.find((r) => r.poLine.id === l.id);
        return {
          quantity: l.quantity,
          quantityReceived: l.quantityReceived + (recv?.qtyScaled ?? 0),
        };
      });
      const newPoStatus = derivePurchaseOrderStatusAfterReceipt(updatedLines);
      // Don't downgrade a PO already closed (fully billed) by receipt status.
      if (po.status !== "closed") {
        await tx
          .update(purchaseOrder)
          .set({ status: newPoStatus, updatedAt: new Date() })
          .where(eq(purchaseOrder.id, po.id));
      }

      return { receiptId: receipt.id, entryId, grniTotal, newPoStatus };
    });

    const created = await db.query.goodsReceipt.findFirst({
      where: eq(goodsReceipt.id, result.receiptId),
      with: { lines: true, contact: true },
    });

    logAudit({
      ctx,
      action: "create",
      entityType: "goods_receipt",
      entityId: result.receiptId,
      changes: { purchaseOrderId: po.id, journalEntryId: result.entryId, grniTotal: result.grniTotal },
      request,
    });

    return NextResponse.json(
      { goodsReceipt: created, journalEntryId: result.entryId, purchaseOrderStatus: result.newPoStatus },
      { status: 201 }
    );
  } catch (err) {
    return handleError(err);
  }
}
