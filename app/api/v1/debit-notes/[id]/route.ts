import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { debitNote, debitNoteLine } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { notDeleted, softDelete } from "@/lib/db/soft-delete";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);

    const found = await db.query.debitNote.findFirst({
      where: and(
        eq(debitNote.id, id),
        eq(debitNote.organizationId, ctx.organizationId),
        notDeleted(debitNote.deletedAt)
      ),
      with: {
        contact: true,
        lines: {
          with: { account: true, taxRate: true },
        },
      },
    });

    if (!found) return notFound("Debit note");
    return NextResponse.json({ debitNote: found });
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
    requireRole(ctx, "manage:debit-notes");

    const existing = await db.query.debitNote.findFirst({
      where: and(
        eq(debitNote.id, id),
        eq(debitNote.organizationId, ctx.organizationId),
        notDeleted(debitNote.deletedAt)
      ),
    });

    if (!existing) return notFound("Debit note");
    if (existing.status !== "draft") {
      return NextResponse.json(
        { error: "Only draft debit notes can be edited" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const [updated] = await db
      .update(debitNote)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(debitNote.id, id))
      .returning();

    return NextResponse.json({ debitNote: updated });
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
    requireRole(ctx, "manage:debit-notes");

    const existing = await db.query.debitNote.findFirst({
      where: and(
        eq(debitNote.id, id),
        eq(debitNote.organizationId, ctx.organizationId),
        notDeleted(debitNote.deletedAt)
      ),
    });

    if (!existing) return notFound("Debit note");
    if (existing.status !== "draft") {
      return NextResponse.json(
        { error: "Only draft debit notes can be deleted" },
        { status: 400 }
      );
    }

    await db.delete(debitNoteLine).where(eq(debitNoteLine.debitNoteId, id));
    await db.update(debitNote).set(softDelete()).where(eq(debitNote.id, id));

    logAudit({
      ctx,
      action: "delete",
      entityType: "debit_note",
      entityId: id,
      changes: existing as Record<string, unknown>,
      request,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
