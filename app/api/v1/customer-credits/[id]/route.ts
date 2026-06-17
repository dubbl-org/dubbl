import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { customerCredit } from "@/lib/db/schema";
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

    const found = await db.query.customerCredit.findFirst({
      where: and(
        eq(customerCredit.id, id),
        eq(customerCredit.organizationId, ctx.organizationId),
        notDeleted(customerCredit.deletedAt)
      ),
      with: { contact: true, journalEntry: true },
    });

    if (!found) return notFound("Customer credit");

    return NextResponse.json({ customerCredit: found });
  } catch (err) {
    return handleError(err);
  }
}
