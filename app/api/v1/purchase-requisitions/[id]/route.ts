import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { purchaseRequisition, purchaseRequisitionLine, contact } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { notDeleted, softDelete } from "@/lib/db/soft-delete";
import { logAudit, diffChanges } from "@/lib/api/audit";
import { preloadTaxRates } from "@/lib/api/tax-calculator";
import { buildRequisitionLines } from "@/lib/api/requisition-lines";
import { z } from "zod";

const lineSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().default(1),
  unitPrice: z.number().default(0),
  accountId: z.string().nullable().optional(),
  taxRateId: z.string().nullable().optional(),
});

const updateSchema = z.object({
  contactId: z.string().nullable().optional(),
  requestDate: z.string().min(1).optional(),
  requiredDate: z.string().nullable().optional(),
  reference: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  lines: z.array(lineSchema).min(1).optional(),
});

/** Statuses whose request can still be changed; a rejected one is revised and submitted again. */
const EDITABLE = ["draft", "rejected"];

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getAuthContext(request);
    const { id } = await params;
    const item = await db.query.purchaseRequisition.findFirst({
      where: and(
        eq(purchaseRequisition.id, id),
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
    if (!item) return notFound("Purchase requisition");
    return NextResponse.json(item);
  } catch (err) {
    return handleError(err);
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:purchases");
    const { id } = await params;
    const body = await request.json();
    const parsed = updateSchema.parse(body);

    const existing = await db.query.purchaseRequisition.findFirst({
      where: and(
        eq(purchaseRequisition.id, id),
        eq(purchaseRequisition.organizationId, ctx.organizationId),
        notDeleted(purchaseRequisition.deletedAt)
      ),
    });

    if (!existing) return notFound("Purchase requisition");

    // An approved request can still get its supplier, which converting needs
    const supplierOnly = Object.keys(parsed).every((k) => k === "contactId");
    if (!EDITABLE.includes(existing.status) && !(existing.status === "approved" && supplierOnly)) {
      return NextResponse.json(
        { error: existing.status === "approved" ? "Only the supplier of an approved requisition can be changed" : "Only draft or rejected requisitions can be edited" },
        { status: 400 }
      );
    }

    const header = {
      ...(parsed.contactId !== undefined && { contactId: parsed.contactId || null }),
      ...(parsed.requestDate && { requestDate: parsed.requestDate }),
      ...(parsed.requiredDate !== undefined && { requiredDate: parsed.requiredDate || null }),
      ...(parsed.reference !== undefined && { reference: parsed.reference || null }),
      ...(parsed.notes !== undefined && { notes: parsed.notes || null }),
    };

    if (parsed.contactId && !(await db.query.contact.findFirst({ where: and(eq(contact.id, parsed.contactId), eq(contact.organizationId, ctx.organizationId)) }))) {
      return notFound("Supplier");
    }

    // Lines are replaced as a whole, with totals recomputed the same way POST does
    const built = parsed.lines
      ? buildRequisitionLines(parsed.lines, existing.currencyCode, await preloadTaxRates(parsed.lines.map((l) => l.taxRateId).filter(Boolean) as string[]))
      : null;

    const updated = await db.transaction(async (tx) => {
      if (built) {
        await tx.delete(purchaseRequisitionLine).where(eq(purchaseRequisitionLine.requisitionId, id));
        await tx.insert(purchaseRequisitionLine).values(built.lines.map((l) => ({ requisitionId: id, ...l })));
      }
      const [row] = await tx
        .update(purchaseRequisition)
        .set({
          ...header,
          ...(built && { subtotal: built.subtotal, taxTotal: built.taxTotal, total: built.total }),
          updatedAt: new Date(),
        })
        .where(eq(purchaseRequisition.id, id))
        .returning();
      return row;
    });

    logAudit({ ctx, action: "update", entityType: "purchase_requisition", entityId: id, changes: diffChanges(existing as Record<string, unknown>, updated as Record<string, unknown>), request });

    return NextResponse.json(updated);
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:purchases");
    const { id } = await params;

    const [deleted] = await db
      .update(purchaseRequisition)
      .set(softDelete())
      .where(
        and(
          eq(purchaseRequisition.id, id),
          eq(purchaseRequisition.organizationId, ctx.organizationId),
          notDeleted(purchaseRequisition.deletedAt)
        )
      )
      .returning();

    if (!deleted) return notFound("Purchase requisition");

    logAudit({
      ctx,
      action: "delete",
      entityType: "purchase_requisition",
      entityId: id,
      changes: deleted as Record<string, unknown>,
      request,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
