import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  purchaseOrder,
  purchaseOrderLine,
  bill,
  billLine,
  billPurchaseOrder,
} from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound, validationError } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { logAudit } from "@/lib/api/audit";
import { getNextNumber } from "@/lib/api/numbering";
import {
  derivePurchaseOrderStatusAfterBilling,
  resolveConvertLineAllocations,
} from "@/lib/api/procurement";
import { z } from "zod";

/**
 * Convert a purchase order to a bill.
 *
 * Two modes:
 *  • FULL (no `lines` in body, legacy): bill the entire PO, mark it closed.
 *  • PARTIAL (`lines` supplied): create a bill for only the requested
 *    quantity-to-bill per line. Increments purchaseOrderLine.quantityBilled,
 *    records the PO<->bill link in the bill_purchase_order join table (so a PO
 *    can be billed across MULTIPLE bills), and sets the PO status from remaining
 *    quantity: partial (some billed) or closed (fully billed).
 *
 * Quantities in `lines` are WHOLE units (decimal allowed); stored x100 to match
 * the rest of the schema. Amounts are integer cents.
 */
const partialLineSchema = z.object({
  purchaseOrderLineId: z.string().min(1),
  // Quantity to bill now, in whole units.
  quantity: z.number().positive(),
});

const convertSchema = z.object({
  lines: z.array(partialLineSchema).min(1).optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:bills");

    const rawBody = await request.json().catch(() => ({}));
    const parsed = convertSchema.parse(rawBody ?? {});

    const found = await db.query.purchaseOrder.findFirst({
      where: and(
        eq(purchaseOrder.id, id),
        eq(purchaseOrder.organizationId, ctx.organizationId),
        notDeleted(purchaseOrder.deletedAt)
      ),
      with: { lines: true },
    });

    if (!found) return notFound("Purchase order");
    if (found.status === "draft" || found.status === "void" || found.status === "closed") {
      return NextResponse.json(
        { error: "Purchase order cannot be converted in its current status" },
        { status: 400 }
      );
    }

    const isPartial = !!parsed.lines;

    // Legacy full convert guards against double-conversion via convertedBillId.
    // Partial billing intentionally supports multiple bills, so it skips that.
    if (!isPartial && found.convertedBillId) {
      return NextResponse.json(
        { error: "Purchase order has already been converted to a bill" },
        { status: 400 }
      );
    }

    const lineById = new Map(found.lines.map((l) => [l.id, l]));

    // Resolve which lines to bill and at what quantity (x100).
    type BillItem = {
      poLine: typeof found.lines[number];
      qtyScaled: number; // x100
      qtyUnits: number; // whole units (for amount math)
    };
    const items: BillItem[] = [];

    if (isPartial) {
      for (const r of parsed.lines!) {
        const poLine = lineById.get(r.purchaseOrderLineId);
        if (!poLine) {
          return validationError(`PO line ${r.purchaseOrderLineId} not found on this purchase order`);
        }
        const qtyScaled = Math.round(r.quantity * 100);
        if (qtyScaled <= 0) continue;
        const remaining = poLine.quantity - poLine.quantityBilled;
        if (qtyScaled > remaining) {
          return validationError(
            `Billing ${r.quantity} exceeds un-billed quantity (${remaining / 100}) on line "${poLine.description}"`
          );
        }
        items.push({ poLine, qtyScaled, qtyUnits: r.quantity });
      }
      if (items.length === 0) return validationError("No quantities to bill");
    } else {
      // Full convert: bill whatever remains un-billed on each line (initially the
      // full ordered quantity), so re-converting respects prior partial bills.
      for (const poLine of found.lines) {
        const remaining = poLine.quantity - poLine.quantityBilled;
        if (remaining <= 0) continue;
        items.push({ poLine, qtyScaled: remaining, qtyUnits: remaining / 100 });
      }
      if (items.length === 0) {
        return validationError("Purchase order is already fully billed");
      }
    }

    const billNumber = await getNextNumber(ctx.organizationId, "bill", "bill_number", "BILL");

    // Split each PO line's billed quantity into a GRN-matched portion (already
    // goods-received → bill must CLEAR GRNI, not re-capitalise stock) and an
    // un-received remainder (capitalised fresh). Without this, converting a
    // goods-received PO double-counts inventory and strands GRNI.
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
      // Compute bill totals from the billed quantity x PO unit price, tax
      // pro-rated. Each PO line may emit MULTIPLE bill lines (one per matched /
      // unmatched slice); slice amounts/tax are pro-rated by quantity with the
      // last slice absorbing the rounding residual so totals stay exact.
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
        const lineQtyRatio = it.poLine.quantity > 0 ? it.qtyScaled / it.poLine.quantity : 1;
        const lineAmount = Math.round(it.poLine.unitPrice * (it.qtyScaled / 100));
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

      await tx.insert(billLine).values(
        billLines.map((l) => ({
          billId: createdBill.id,
          description: l.description,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          accountId: l.accountId,
          taxRateId: l.taxRateId,
          taxAmount: l.taxAmount,
          amount: l.amount,
          inventoryItemId: l.inventoryItemId,
          warehouseId: l.warehouseId,
          // Link GRN-matched slices so the bill posting CLEARS GRNI (+ PPV)
          // instead of re-capitalising stock already on hand from the receipt.
          goodsReceiptLineId: l.goodsReceiptLineId,
          sortOrder: l.sortOrder,
        }))
      );

      // Link PO <-> bill in the join table (supports multiple bills per PO).
      await tx
        .insert(billPurchaseOrder)
        .values({ billId: createdBill.id, purchaseOrderId: found.id })
        .onConflictDoNothing();

      // Increment quantityBilled on each PO line.
      for (const it of items) {
        await tx
          .update(purchaseOrderLine)
          .set({ quantityBilled: it.poLine.quantityBilled + it.qtyScaled })
          .where(eq(purchaseOrderLine.id, it.poLine.id));
      }

      // Recompute PO status from cumulative billed quantity.
      const updatedLines = found.lines.map((l) => {
        const it = items.find((x) => x.poLine.id === l.id);
        return {
          quantity: l.quantity,
          quantityBilled: l.quantityBilled + (it?.qtyScaled ?? 0),
        };
      });
      const newStatus = derivePurchaseOrderStatusAfterBilling(updatedLines);

      const [updatedPO] = await tx
        .update(purchaseOrder)
        .set({
          status: newStatus,
          // Keep the legacy single-bill pointer for back-compat (first bill).
          convertedBillId: found.convertedBillId ?? createdBill.id,
          updatedAt: new Date(),
        })
        .where(eq(purchaseOrder.id, found.id))
        .returning();

      return { bill: createdBill, purchaseOrder: updatedPO, newStatus };
    });

    logAudit({
      ctx,
      action: "convert",
      entityType: "purchase_order",
      entityId: id,
      changes: { previousStatus: found.status, newStatus: result.newStatus, billId: result.bill.id, partial: isPartial },
      request,
    });

    return NextResponse.json(
      { purchaseOrder: result.purchaseOrder, bill: result.bill },
      { status: 201 }
    );
  } catch (err) {
    return handleError(err);
  }
}
