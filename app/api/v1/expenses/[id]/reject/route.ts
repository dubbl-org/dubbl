import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { expenseClaim } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { z } from "zod";

const rejectSchema = z.object({
  reason: z.string().min(1, "Rejection reason is required"),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "approve:expenses");

    const body = await request.json();
    const parsed = rejectSchema.parse(body);

    const found = await db.query.expenseClaim.findFirst({
      where: and(
        eq(expenseClaim.id, id),
        eq(expenseClaim.organizationId, ctx.organizationId),
        notDeleted(expenseClaim.deletedAt)
      ),
    });

    if (!found) return notFound("Expense claim");
    if (found.status !== "submitted") {
      return NextResponse.json(
        { error: "Only submitted expense claims can be rejected" },
        { status: 400 }
      );
    }

    const [updated] = await db
      .update(expenseClaim)
      .set({
        status: "rejected",
        rejectionReason: parsed.reason,
        rejectedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(expenseClaim.id, id))
      .returning();

    return NextResponse.json({ expenseClaim: updated });
  } catch (err) {
    return handleError(err);
  }
}
