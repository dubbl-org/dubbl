import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { goodsReceipt, bill, billLine } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound, validationError } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { getNextNumber } from "@/lib/api/numbering";
import { assertNotLocked } from "@/lib/api/period-lock";
import { resolveDocumentCurrency } from "@/lib/currency/resolve-currency";
import { linkBillToPurchaseOrders } from "@/app/api/v1/bills/_procurement";
import { logAudit } from "@/lib/api/audit";

/**
 * Create a draft bill from a goods receipt (GRN).
 *
 * Reads the GRN, its lines and its linked purchase order, then creates a DRAFT
 * bill for the same supplier with one bill line per received GRN line:
 *   - description / inventoryItem / warehouse mirror the GRN line
 *   - quantity = quantityReceived (x100, document scale)
 *   - unitPrice = the GRN line's recorded unit cost (PO unit cost at receipt)
 *   - goodsReceiptLineId links the bill line to the GRN line so that, when the
 *     bill is later received/approved, the existing GRNI/PPV three-way-match
 *     logic (see app/api/v1/bills/_procurement.ts) clears the GRNI accrual that
 *     was posted at receipt time and stamps the GRN as billed.
 *
 * We intentionally do NOT post any journal entry here: the bill is a draft, and
 * GRNI clearing happens at bill posting (receive/approve) exactly as for a bill
 * created the normal way. All amounts are integer minor units; quantities x100.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:bills");

    const grn = await db.query.goodsReceipt.findFirst({
      where: and(
        eq(goodsReceipt.id, id),
        eq(goodsReceipt.organizationId, ctx.organizationId),
        notDeleted(goodsReceipt.deletedAt)
      ),
      with: { purchaseOrder: true, lines: true },
    });

    if (!grn) return notFound("Goods receipt");

    if (grn.status === "void") {
      return validationError("This goods receipt has been cancelled and cannot be billed");
    }
    if (grn.status === "billed") {
      return validationError("This goods receipt has already been billed");
    }
    if (grn.status !== "received") {
      return validationError("Only a received goods receipt can be turned into a bill");
    }

    const billableLines = grn.lines.filter((l) => l.quantityReceived > 0);
    if (billableLines.length === 0) {
      return validationError("This goods receipt has no received quantities to bill");
    }

    // Bill dates default to today (issue) and today (due); the user can edit the
    // draft afterwards. Period lock guards the issue date.
    const today = new Date().toISOString().slice(0, 10);
    await assertNotLocked(ctx.organizationId, today);

    // Currency follows the same resolution as a normal bill (explicit > contact
    // default > org default). The GRN's PO carries the original currency, so use
    // it when present so the billed unit costs line up with what was received.
    const currencyCode = await resolveDocumentCurrency(
      ctx.organizationId,
      grn.purchaseOrder?.currencyCode,
      grn.contactId
    );

    const billNumber = await getNextNumber(
      ctx.organizationId,
      "bill",
      "bill_number",
      "BILL"
    );

    // Build bill lines mirroring received qty x recorded unit cost. unitCost is
    // already in minor units and quantityReceived is x100; the line amount is
    // (quantityReceived / 100) * unitCost, rounded to whole minor units.
    const processedLines = billableLines
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((l, i) => {
        const amount = Math.round((l.quantityReceived / 100) * l.unitCost);
        return {
          description: l.description,
          quantity: l.quantityReceived,
          unitPrice: l.unitCost,
          accountId: null,
          taxRateId: null,
          discountPercent: 0,
          taxAmount: 0,
          amount,
          inventoryItemId: l.inventoryItemId,
          warehouseId: l.warehouseId,
          projectId: null,
          goodsReceiptLineId: l.id,
          sortOrder: i,
        };
      });

    const subtotal = processedLines.reduce((sum, l) => sum + l.amount, 0);
    const taxTotal = 0;
    const total = subtotal + taxTotal;

    const created = await db.transaction(async (tx) => {
      const [createdBill] = await tx
        .insert(bill)
        .values({
          organizationId: ctx.organizationId,
          contactId: grn.contactId,
          billNumber,
          issueDate: today,
          dueDate: today,
          status: "draft",
          reference: grn.receiptNumber,
          notes: grn.purchaseOrder
            ? `Created from goods receipt ${grn.receiptNumber} (PO ${grn.purchaseOrder.poNumber})`
            : `Created from goods receipt ${grn.receiptNumber}`,
          subtotal,
          taxTotal,
          total,
          amountPaid: 0,
          amountDue: total,
          currencyCode,
          createdBy: ctx.userId,
        })
        .returning();

      await tx.insert(billLine).values(
        processedLines.map((l) => ({ billId: createdBill.id, ...l }))
      );

      // Link the source purchase order (if any) so the bill is traceable back to
      // it and shows up in PO-driven three-way-match views.
      if (grn.purchaseOrderId) {
        await linkBillToPurchaseOrders(createdBill.id, [grn.purchaseOrderId], tx);
      }

      return createdBill;
    });

    logAudit({
      ctx,
      action: "create",
      entityType: "bill",
      entityId: created.id,
      changes: { fromGoodsReceiptId: grn.id, purchaseOrderId: grn.purchaseOrderId },
      request,
    });

    return NextResponse.json({ bill: created }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
