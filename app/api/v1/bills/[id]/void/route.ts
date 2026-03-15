import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bill } from "@/lib/db/schema";
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
    requireRole(ctx, "approve:bills");

    const found = await db.query.bill.findFirst({
      where: and(
        eq(bill.id, id),
        eq(bill.organizationId, ctx.organizationId),
        notDeleted(bill.deletedAt)
      ),
    });

    if (!found) return notFound("Bill");
    if (found.status === "void") {
      return NextResponse.json({ error: "Already voided" }, { status: 400 });
    }

    const [updated] = await db
      .update(bill)
      .set({
        status: "void",
        voidedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(bill.id, id))
      .returning();

    logAudit({ ctx, action: "void", entityType: "bill", entityId: id, changes: { previousStatus: found.status }, request });

    return NextResponse.json({ bill: updated });
  } catch (err) {
    return handleError(err);
  }
}
