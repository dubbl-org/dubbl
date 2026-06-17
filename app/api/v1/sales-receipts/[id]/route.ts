import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { salesReceipt } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError, notFound } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);

    const found = await db.query.salesReceipt.findFirst({
      where: and(
        eq(salesReceipt.id, id),
        eq(salesReceipt.organizationId, ctx.organizationId),
        notDeleted(salesReceipt.deletedAt)
      ),
      with: {
        contact: true,
        lines: true,
        bankAccount: true,
        depositAccount: true,
        journalEntry: true,
      },
    });

    if (!found) return notFound("Sales receipt");

    return NextResponse.json({ salesReceipt: found });
  } catch (err) {
    return handleError(err);
  }
}
