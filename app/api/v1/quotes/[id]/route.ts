import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { quote, quoteLine } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { logAudit, diffChanges } from "@/lib/api/audit";
import { notDeleted, softDelete } from "@/lib/db/soft-delete";

// Header fields safe to patch on a draft quote (whitelist — a blind
// spread would let the caller overwrite totals, status, ids or audit columns).
const updateHeaderSchema = z
  .object({
    contactId: z.string().uuid().optional(),
    issueDate: z.string().min(1).optional(),
    expiryDate: z.string().min(1).optional(),
    reference: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
    currencyCode: z.string().min(1).optional(),
  })
  .partial();

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);

    const found = await db.query.quote.findFirst({
      where: and(
        eq(quote.id, id),
        eq(quote.organizationId, ctx.organizationId),
        notDeleted(quote.deletedAt)
      ),
      with: {
        contact: true,
        lines: {
          with: { account: true, taxRate: true },
        },
      },
    });

    if (!found) return notFound("Quote");
    return NextResponse.json({ quote: found });
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
    requireRole(ctx, "manage:invoices");

    const existing = await db.query.quote.findFirst({
      where: and(
        eq(quote.id, id),
        eq(quote.organizationId, ctx.organizationId),
        notDeleted(quote.deletedAt)
      ),
    });

    if (!existing) return notFound("Quote");
    if (existing.status !== "draft") {
      return NextResponse.json(
        { error: "Only draft quotes can be edited" },
        { status: 400 }
      );
    }

    const parsed = updateHeaderSchema.parse(await request.json());
    const [updated] = await db
      .update(quote)
      .set({ ...parsed, updatedAt: new Date() })
      .where(
        and(
          eq(quote.id, id),
          eq(quote.organizationId, ctx.organizationId)
        )
      )
      .returning();

    logAudit({ ctx, action: "update", entityType: "quote", entityId: id, changes: diffChanges(existing as Record<string, unknown>, updated as Record<string, unknown>), request });

    return NextResponse.json({ quote: updated });
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
    requireRole(ctx, "manage:invoices");

    const existing = await db.query.quote.findFirst({
      where: and(
        eq(quote.id, id),
        eq(quote.organizationId, ctx.organizationId),
        notDeleted(quote.deletedAt)
      ),
    });

    if (!existing) return notFound("Quote");
    if (existing.status !== "draft") {
      return NextResponse.json(
        { error: "Only draft quotes can be deleted" },
        { status: 400 }
      );
    }

    await db.delete(quoteLine).where(eq(quoteLine.quoteId, id));
    await db.update(quote).set(softDelete()).where(eq(quote.id, id));

    logAudit({
      ctx,
      action: "delete",
      entityType: "quote",
      entityId: id,
      changes: existing as Record<string, unknown>,
      request,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
