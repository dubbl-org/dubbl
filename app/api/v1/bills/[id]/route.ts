import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bill, billLine } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { logAudit, diffChanges } from "@/lib/api/audit";
import { notDeleted, softDelete } from "@/lib/db/soft-delete";

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
    return NextResponse.json({ bill: found });
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
    const [updated] = await db
      .update(bill)
      .set({ ...body, updatedAt: new Date() })
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
