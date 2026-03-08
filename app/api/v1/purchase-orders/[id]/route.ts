import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { purchaseOrder, purchaseOrderLine } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { notDeleted, softDelete } from "@/lib/db/soft-delete";
import { decimalToCents } from "@/lib/money";
import { z } from "zod";

const lineSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().default(1),
  unitPrice: z.number().default(0),
  accountId: z.string().nullable().optional(),
  taxRateId: z.string().nullable().optional(),
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

    // If lines are provided, replace them all
    if (parsed.lines) {
      let subtotal = 0;
      const processedLines = parsed.lines.map((l, i) => {
        const amount = decimalToCents(l.quantity * l.unitPrice);
        subtotal += amount;
        return {
          purchaseOrderId: id,
          description: l.description,
          quantity: Math.round(l.quantity * 100),
          unitPrice: decimalToCents(l.unitPrice),
          accountId: l.accountId || null,
          taxRateId: l.taxRateId || null,
          taxAmount: 0,
          amount,
          sortOrder: i,
        };
      });

      const total = subtotal;

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
          taxTotal: 0,
          total,
          updatedAt: new Date(),
        })
        .where(eq(purchaseOrder.id, id))
        .returning();

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

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
