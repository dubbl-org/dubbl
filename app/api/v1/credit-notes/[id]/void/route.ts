import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { creditNote } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { notDeleted } from "@/lib/db/soft-delete";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:credit-notes");

    const found = await db.query.creditNote.findFirst({
      where: and(
        eq(creditNote.id, id),
        eq(creditNote.organizationId, ctx.organizationId),
        notDeleted(creditNote.deletedAt)
      ),
    });

    if (!found) return notFound("Credit note");
    if (found.status === "void") {
      return NextResponse.json({ error: "Already voided" }, { status: 400 });
    }

    const [updated] = await db
      .update(creditNote)
      .set({
        status: "void",
        voidedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(creditNote.id, id))
      .returning();

    logAudit({ ctx, action: "void", entityType: "credit_note", entityId: id, changes: { previousStatus: found.status }, request });

    return NextResponse.json({ creditNote: updated });
  } catch (err) {
    return handleError(err);
  }
}
