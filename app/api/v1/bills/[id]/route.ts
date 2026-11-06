import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  releaseBillPurchaseOrderQuantities,
  recountBillPurchaseOrders,
} from "@/app/api/v1/bills/_procurement";
import { bill, billLine, organization } from "@/lib/db/schema";
import { eq, and, ne } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { assertLineStockRefs } from "@/lib/api/line-stock-refs";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { logAudit, diffChanges } from "@/lib/api/audit";
import { notDeleted, softDelete } from "@/lib/db/soft-delete";
import { toBaseAmounts } from "@/lib/currency/base-amount";
import { buildBillLines, loadBillTaxContext } from "@/lib/api/bill-lines";
import { assertNotLocked } from "@/lib/api/period-lock";
import { z } from "zod";

// Optional full line-set replacement on update (draft bills only). Lets callers
// edit lines AND set the inventory / warehouse / project / GRN dimensions.
// When omitted, only the bill header fields in the body are updated.
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
    // The supplier's own invoice number. Blank keeps the current number.
    billNumber: z.string().nullable().optional(),
    issueDate: z.string().min(1).optional(),
    dueDate: z.string().min(1).optional(),
    reference: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
  })
  .partial();

const updateSchema = updateHeaderSchema.extend({
  lines: z.array(updateLineSchema).min(1).optional(),
  // Save even when another bill from this supplier has the same number.
  confirmDuplicate: z.boolean().optional(),
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
    const { lines, billNumber: rawBillNumber, confirmDuplicate, ...header } = parsed;
    if (lines) await assertLineStockRefs(ctx.organizationId, lines);

    if (header.issueDate) await assertNotLocked(ctx.organizationId, header.issueDate);

    const headerUpdate: Record<string, unknown> = {
      ...header,
      updatedAt: new Date(),
    };

    // A changed supplier bill number goes through the same duplicate check as
    // create, honouring the org's duplicateBillStrategy.
    const billNumber = rawBillNumber?.trim();
    const contactId = header.contactId ?? existing.contactId;
    if (billNumber && (billNumber !== existing.billNumber || contactId !== existing.contactId)) {
      const org = await db.query.organization.findFirst({
        where: eq(organization.id, ctx.organizationId),
        columns: { duplicateBillStrategy: true },
      });
      const strategy = org?.duplicateBillStrategy ?? "warn";
      if (strategy === "block" || (strategy === "warn" && !confirmDuplicate)) {
        const dup = await db.query.bill.findFirst({
          where: and(
            eq(bill.organizationId, ctx.organizationId),
            eq(bill.contactId, contactId),
            eq(bill.billNumber, billNumber),
            ne(bill.status, "void"),
            ne(bill.id, id),
            notDeleted(bill.deletedAt)
          ),
          columns: { id: true, billNumber: true },
        });
        if (dup) {
          return NextResponse.json(
            {
              error: `A bill with number "${billNumber}" already exists for this supplier`,
              ...(strategy === "warn" ? { warning: "duplicate_bill", hint: "Resubmit with confirmDuplicate=true to save it anyway" } : {}),
              duplicate: { id: dup.id, billNumber: dup.billNumber },
            },
            { status: 409 }
          );
        }
      }
    }
    if (billNumber) headerUpdate.billNumber = billNumber;

    // Recompute totals from the new line set (same math as create), and persist
    // the inventory / warehouse / project / GRN dimensions per line.
    if (lines) {
      const { rates, kinds } = await loadBillTaxContext(lines);
      const built = buildBillLines(lines, existing.currencyCode, rates, kinds);
      headerUpdate.subtotal = built.subtotal;
      headerUpdate.taxTotal = built.taxTotal;
      headerUpdate.total = built.total;
      headerUpdate.amountDue = built.amountDue - existing.amountPaid;

      await db.transaction(async (tx) => {
        await tx.delete(billLine).where(eq(billLine.billId, id));
        await tx.insert(billLine).values(
          built.lines.map((l) => ({ billId: id, ...l }))
        );
        // Linked purchase orders: count the new lines instead of the old ones.
        await recountBillPurchaseOrders(ctx.organizationId, id, tx);
      });
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

    await db.transaction(async (tx) => {
      // Give the linked purchase orders back what this bill counted as billed.
      await releaseBillPurchaseOrderQuantities(ctx.organizationId, id, tx);
      await tx.delete(billLine).where(eq(billLine.billId, id));
      await tx.update(bill).set(softDelete()).where(eq(bill.id, id));
    });

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
