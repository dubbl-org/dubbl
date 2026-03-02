import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bankAccount, bankReconciliation } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { parsePagination, paginatedResponse } from "@/lib/api/pagination";
import { z } from "zod";

const createSchema = z.object({
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  startBalance: z.number().int(),
  endBalance: z.number().int(),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    const url = new URL(request.url);
    const { page, limit, offset } = parsePagination(url);

    // Verify bank account belongs to organization
    const account = await db.query.bankAccount.findFirst({
      where: and(
        eq(bankAccount.id, id),
        eq(bankAccount.organizationId, ctx.organizationId),
        notDeleted(bankAccount.deletedAt)
      ),
    });

    if (!account) return notFound("Bank account");

    const reconciliations = await db.query.bankReconciliation.findMany({
      where: eq(bankReconciliation.bankAccountId, id),
      orderBy: desc(bankReconciliation.createdAt),
      limit,
      offset,
    });

    const [countResult] = await db
      .select({ count: db.$count(bankReconciliation) })
      .from(bankReconciliation)
      .where(eq(bankReconciliation.bankAccountId, id));

    return NextResponse.json(
      paginatedResponse(reconciliations, Number(countResult?.count || 0), page, limit)
    );
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:banking");

    // Verify bank account belongs to organization
    const account = await db.query.bankAccount.findFirst({
      where: and(
        eq(bankAccount.id, id),
        eq(bankAccount.organizationId, ctx.organizationId),
        notDeleted(bankAccount.deletedAt)
      ),
    });

    if (!account) return notFound("Bank account");

    const body = await request.json();
    const parsed = createSchema.parse(body);

    const [created] = await db
      .insert(bankReconciliation)
      .values({
        bankAccountId: id,
        startDate: parsed.startDate,
        endDate: parsed.endDate,
        startBalance: parsed.startBalance,
        endBalance: parsed.endBalance,
      })
      .returning();

    return NextResponse.json({ reconciliation: created }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
