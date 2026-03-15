import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { quote } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { logAudit } from "@/lib/api/audit";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:invoices");

    const found = await db.query.quote.findFirst({
      where: and(
        eq(quote.id, id),
        eq(quote.organizationId, ctx.organizationId),
        notDeleted(quote.deletedAt)
      ),
    });

    if (!found) return notFound("Quote");
    if (found.status !== "sent") {
      return NextResponse.json(
        { error: "Only sent quotes can be accepted" },
        { status: 400 }
      );
    }

    const today = new Date().toISOString().split("T")[0];
    if (found.expiryDate < today) {
      return NextResponse.json(
        { error: "This quote has expired" },
        { status: 400 }
      );
    }

    const [updated] = await db
      .update(quote)
      .set({
        status: "accepted",
        updatedAt: new Date(),
      })
      .where(eq(quote.id, id))
      .returning();

    logAudit({ ctx, action: "accept", entityType: "quote", entityId: id, changes: { previousStatus: found.status }, request });

    return NextResponse.json({ quote: updated });
  } catch (err) {
    return handleError(err);
  }
}
