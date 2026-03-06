import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { creditNote, creditNoteLine } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { notDeleted, softDelete } from "@/lib/db/soft-delete";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);

    const found = await db.query.creditNote.findFirst({
      where: and(
        eq(creditNote.id, id),
        eq(creditNote.organizationId, ctx.organizationId),
        notDeleted(creditNote.deletedAt)
      ),
      with: {
        contact: true,
        lines: {
          with: { account: true, taxRate: true },
        },
      },
    });

    if (!found) return notFound("Credit note");
    return NextResponse.json({ creditNote: found });
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
    requireRole(ctx, "manage:credit-notes");

    const existing = await db.query.creditNote.findFirst({
      where: and(
        eq(creditNote.id, id),
        eq(creditNote.organizationId, ctx.organizationId),
        notDeleted(creditNote.deletedAt)
      ),
    });

    if (!existing) return notFound("Credit note");
    if (existing.status !== "draft") {
      return NextResponse.json(
        { error: "Only draft credit notes can be edited" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const [updated] = await db
      .update(creditNote)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(creditNote.id, id))
      .returning();

    return NextResponse.json({ creditNote: updated });
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
    requireRole(ctx, "manage:credit-notes");

    const existing = await db.query.creditNote.findFirst({
      where: and(
        eq(creditNote.id, id),
        eq(creditNote.organizationId, ctx.organizationId),
        notDeleted(creditNote.deletedAt)
      ),
    });

    if (!existing) return notFound("Credit note");
    if (existing.status !== "draft") {
      return NextResponse.json(
        { error: "Only draft credit notes can be deleted" },
        { status: 400 }
      );
    }

    await db.delete(creditNoteLine).where(eq(creditNoteLine.creditNoteId, id));
    await db.update(creditNote).set(softDelete()).where(eq(creditNote.id, id));

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
