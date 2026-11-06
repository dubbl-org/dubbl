import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { purchaseOrder, purchaseOrderLine } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { assertLineStockRefs } from "@/lib/api/line-stock-refs";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { logAudit, diffChanges } from "@/lib/api/audit";
import { notDeleted, softDelete } from "@/lib/db/soft-delete";
import { decimalToMinorUnits } from "@/lib/money";
import { preloadTaxRates, calcTax } from "@/lib/api/tax-calculator";
import { z } from "zod";
import { cancelApprovalRequests } from "@/lib/approvals/engine";

const lineSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().default(1),
  unitPrice: z.number().default(0),
  accountId: z.string().nullable().optional(),
  taxRateId: z.string().nullable().optional(),
  discountPercent: z.number().int().min(0).max(10000).default(0),
  // Stock item this line orders; goods receipts and bills then move stock.
  inventoryItemId: z.string().uuid().nullable().optional(),
  warehouseId: z.string().uuid().nullable().optional(),
});

const updateSchema = z.object({
  contactId: z.string().min(1).optional(),
  issueDate: z.string().min(1).optional(),
  deliveryDate: z.string().nullable().optional(),
  reference: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  lines: z.array(lineSchema).min(1).optional(),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);

    const found = await db.query.purchaseOrder.findFirst({
      where: and(
        eq(purchaseOrder.id, id),
        eq(purchaseOrder.organizationId, ctx.organizationId),
        notDeleted(purchaseOrder.deletedAt)
      ),
      with: {
        contact: true,
        lines: {
          with: { account: true, taxRate: true },
        },
      },
    });

    if (!found) return notFound("Purchase order");
    return NextResponse.json({ purchaseOrder: found });
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:bills");

    const existing = await db.query.purchaseOrder.findFirst({
      where: and(
        eq(purchaseOrder.id, id),
        eq(purchaseOrder.organizationId, ctx.organizationId),
        notDeleted(purchaseOrder.deletedAt)
      ),
    });

    if (!existing) return notFound("Purchase order");
    if (existing.status !== "draft") {
      return NextResponse.json(
        { error: "Only draft purchase orders can be edited" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const parsed = updateSchema.parse(body);
    if (parsed.lines) await assertLineStockRefs(ctx.organizationId, parsed.lines);

    // An approval covers the order as it was: editing it cancels any pending
    // or granted approval, so it has to be submitted again.
    await cancelApprovalRequests(ctx.organizationId, "purchase_order", id);

    // If lines are provided, replace them all
    if (parsed.lines) {
      // Same math as create: discount off the line, tax on top of what's left.
      const ratesMap = await preloadTaxRates(
        parsed.lines.map((l) => l.taxRateId).filter(Boolean) as string[]
      );
      let subtotal = 0;
      const processedLines = parsed.lines.map((l, i) => {
        const grossAmount = decimalToMinorUnits(l.quantity * l.unitPrice, existing.currencyCode);
        const discountAmount = l.discountPercent ? Math.round(grossAmount * l.discountPercent / 10000) : 0;
        const amount = grossAmount - discountAmount;
        subtotal += amount;
        const taxRateId = l.taxRateId || null;
        return {
          purchaseOrderId: id,
          description: l.description,
          quantity: Math.round(l.quantity * 100),
          unitPrice: decimalToMinorUnits(l.unitPrice, existing.currencyCode),
          accountId: l.accountId || null,
          taxRateId,
          inventoryItemId: l.inventoryItemId || null,
          warehouseId: l.warehouseId || null,
          discountPercent: l.discountPercent,
          taxAmount: taxRateId ? calcTax(amount, ratesMap.get(taxRateId) ?? 0) : 0,
          amount,
          sortOrder: i,
        };
      });

      const taxTotal = processedLines.reduce((s, l) => s + l.taxAmount, 0);
      const total = subtotal + taxTotal;

      // Delete old lines and insert new ones
      await db.delete(purchaseOrderLine).where(eq(purchaseOrderLine.purchaseOrderId, id));
      await db.insert(purchaseOrderLine).values(processedLines);

      const [updated] = await db
        .update(purchaseOrder)
        .set({
          contactId: parsed.contactId || existing.contactId,
          issueDate: parsed.issueDate || existing.issueDate,
          deliveryDate: parsed.deliveryDate !== undefined ? parsed.deliveryDate : existing.deliveryDate,
          reference: parsed.reference !== undefined ? parsed.reference : existing.reference,
          notes: parsed.notes !== undefined ? parsed.notes : existing.notes,
          subtotal,
          taxTotal,
          total,
          updatedAt: new Date(),
        })
        .where(eq(purchaseOrder.id, id))
        .returning();

      logAudit({ ctx, action: "update", entityType: "purchase_order", entityId: id, changes: diffChanges(existing as Record<string, unknown>, updated as Record<string, unknown>), request });

      return NextResponse.json({ purchaseOrder: updated });
    }

    // Update only header fields
    const [updated] = await db
      .update(purchaseOrder)
      .set({
        ...(parsed.contactId && { contactId: parsed.contactId }),
        ...(parsed.issueDate && { issueDate: parsed.issueDate }),
        ...(parsed.deliveryDate !== undefined && { deliveryDate: parsed.deliveryDate }),
        ...(parsed.reference !== undefined && { reference: parsed.reference }),
        ...(parsed.notes !== undefined && { notes: parsed.notes }),
        updatedAt: new Date(),
      })
      .where(eq(purchaseOrder.id, id))
      .returning();

    logAudit({ ctx, action: "update", entityType: "purchase_order", entityId: id, changes: diffChanges(existing as Record<string, unknown>, updated as Record<string, unknown>), request });

    return NextResponse.json({ purchaseOrder: updated });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:bills");

    const existing = await db.query.purchaseOrder.findFirst({
      where: and(
        eq(purchaseOrder.id, id),
        eq(purchaseOrder.organizationId, ctx.organizationId),
        notDeleted(purchaseOrder.deletedAt)
      ),
    });

    if (!existing) return notFound("Purchase order");
    if (existing.status !== "draft") {
      return NextResponse.json(
        { error: "Only draft purchase orders can be deleted" },
        { status: 400 }
      );
    }

    await db.delete(purchaseOrderLine).where(eq(purchaseOrderLine.purchaseOrderId, id));
    await db.update(purchaseOrder).set(softDelete()).where(eq(purchaseOrder.id, id));
    // Nothing left to approve.
    await cancelApprovalRequests(ctx.organizationId, "purchase_order", id, ["pending"]);

    logAudit({
      ctx,
      action: "delete",
      entityType: "purchase_order",
      entityId: id,
      changes: existing as Record<string, unknown>,
      request,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
