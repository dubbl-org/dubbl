import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bill, billLine } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { logAudit, diffChanges } from "@/lib/api/audit";
import { notDeleted, softDelete } from "@/lib/db/soft-delete";
import { toBaseAmounts } from "@/lib/currency/base-amount";
import { decimalToMinorUnits } from "@/lib/money";
import { preloadTaxRates, calcTax } from "@/lib/api/tax-calculator";
import { z } from "zod";

// Optional full line-set replacement on update (draft bills only). Lets callers
// edit lines AND set the FU-SURFACE inventory / warehouse / project / GRN
// dimensions. When omitted, only the bill header fields in the body are updated.
const updateLineSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().default(1),
  unitPrice: z.number().default(0),
  accountId: z.string().nullable().optional(),
  taxRateId: z.string().nullable().optional(),
  discountPercent: z.number().int().min(0).max(10000).default(0),
  inventoryItemId: z.string().nullable().optional(),
  warehouseId: z.string().nullable().optional(),
  projectId: z.string().nullable().optional(),
  goodsReceiptLineId: z.string().nullable().optional(),
});

// Header fields safe to patch on a draft bill (whitelist — avoids a blind
// spread that could overwrite totals, status, ids, audit columns, etc.).
const updateHeaderSchema = z
  .object({
    contactId: z.string().min(1).optional(),
    issueDate: z.string().min(1).optional(),
    dueDate: z.string().min(1).optional(),
    reference: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
  })
  .partial();

const updateSchema = updateHeaderSchema.extend({
  lines: z.array(updateLineSchema).min(1).optional(),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);

    const found = await db.query.bill.findFirst({
      where: and(
        eq(bill.id, id),
        eq(bill.organizationId, ctx.organizationId),
        notDeleted(bill.deletedAt)
      ),
      with: {
        contact: true,
        lines: {
          with: { account: true, taxRate: true },
        },
      },
    });

    if (!found) return notFound("Bill");

    // Base-currency equivalents (for dual-currency display) at the issue rate.
    const base = await toBaseAmounts(
      ctx.organizationId,
      found.currencyCode,
      found.issueDate,
      {
        total: found.total,
        amountDue: found.amountDue,
        amountPaid: found.amountPaid,
        subtotal: found.subtotal,
        taxTotal: found.taxTotal,
      }
    );

    return NextResponse.json({ bill: found, base });
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

    const existing = await db.query.bill.findFirst({
      where: and(
        eq(bill.id, id),
        eq(bill.organizationId, ctx.organizationId),
        notDeleted(bill.deletedAt)
      ),
    });

    if (!existing) return notFound("Bill");
    if (existing.status !== "draft") {
      return NextResponse.json(
        { error: "Only draft bills can be edited" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const parsed = updateSchema.parse(body);
    const { lines, ...header } = parsed;

    // Recompute totals from the new line set (mirrors POST), and persist the
    // FU-SURFACE inventory / warehouse / project / GRN dimensions per line.
    const headerUpdate: Record<string, unknown> = {
      ...header,
      updatedAt: new Date(),
    };

    if (lines) {
      const taxRateIds = lines.map((l) => l.taxRateId).filter(Boolean) as string[];
      const ratesMap = await preloadTaxRates(taxRateIds);

      let subtotal = 0;
      const processedLines = lines.map((l, i) => {
        const grossAmount = decimalToMinorUnits(l.quantity * l.unitPrice, existing.currencyCode);
        const discountAmount = l.discountPercent
          ? Math.round((grossAmount * l.discountPercent) / 10000)
          : 0;
        const amount = grossAmount - discountAmount;
        subtotal += amount;
        const taxRateId = l.taxRateId || null;
        const taxAmount = taxRateId ? calcTax(amount, ratesMap.get(taxRateId) ?? 0) : 0;
        return {
          description: l.description,
          quantity: Math.round(l.quantity * 100),
          unitPrice: decimalToMinorUnits(l.unitPrice, existing.currencyCode),
          accountId: l.accountId || null,
          taxRateId,
          discountPercent: l.discountPercent,
          taxAmount,
          amount,
          inventoryItemId: l.inventoryItemId || null,
          warehouseId: l.warehouseId || null,
          projectId: l.projectId || null,
          goodsReceiptLineId: l.goodsReceiptLineId || null,
          sortOrder: i,
        };
      });

      const taxTotal = processedLines.reduce((s, l) => s + l.taxAmount, 0);
      const total = subtotal + taxTotal;
      headerUpdate.subtotal = subtotal;
      headerUpdate.taxTotal = taxTotal;
      headerUpdate.total = total;
      headerUpdate.amountDue = total - existing.amountPaid;

      await db.delete(billLine).where(eq(billLine.billId, id));
      await db.insert(billLine).values(
        processedLines.map((l) => ({ billId: id, ...l }))
      );
    }

    const [updated] = await db
      .update(bill)
      .set(headerUpdate)
      .where(eq(bill.id, id))
      .returning();

    logAudit({ ctx, action: "update", entityType: "bill", entityId: id, changes: diffChanges(existing as Record<string, unknown>, updated as Record<string, unknown>), request });

    return NextResponse.json({ bill: updated });
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

    const existing = await db.query.bill.findFirst({
      where: and(
        eq(bill.id, id),
        eq(bill.organizationId, ctx.organizationId),
        notDeleted(bill.deletedAt)
      ),
    });

    if (!existing) return notFound("Bill");
    if (existing.status !== "draft") {
      return NextResponse.json(
        { error: "Only draft bills can be deleted" },
        { status: 400 }
      );
    }

    await db.delete(billLine).where(eq(billLine.billId, id));
    await db.update(bill).set(softDelete()).where(eq(bill.id, id));

    logAudit({
      ctx,
      action: "delete",
      entityType: "bill",
      entityId: id,
      changes: existing as Record<string, unknown>,
      request,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
