import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { invoice } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "approve:invoices");

    const found = await db.query.invoice.findFirst({
      where: and(
        eq(invoice.id, id),
        eq(invoice.organizationId, ctx.organizationId),
        notDeleted(invoice.deletedAt)
      ),
    });

    if (!found) return notFound("Invoice");
    if (found.status === "void") {
      return NextResponse.json({ error: "Already voided" }, { status: 400 });
    }

    const [updated] = await db
      .update(invoice)
      .set({
        status: "void",
        voidedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(invoice.id, id))
      .returning();

    return NextResponse.json({ invoice: updated });
  } catch (err) {
    return handleError(err);
  }
}
