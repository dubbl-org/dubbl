import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bankAccount, bankTransaction } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError, notFound } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { parsePagination, paginatedResponse } from "@/lib/api/pagination";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    const url = new URL(request.url);
    const { page, limit, offset } = parsePagination(url);
    const status = url.searchParams.get("status");

    // Verify bank account belongs to organization
    const account = await db.query.bankAccount.findFirst({
      where: and(
        eq(bankAccount.id, id),
        eq(bankAccount.organizationId, ctx.organizationId),
        notDeleted(bankAccount.deletedAt)
      ),
    });

    if (!account) return notFound("Bank account");

    const conditions = [eq(bankTransaction.bankAccountId, id)];

    if (status) {
      conditions.push(
        eq(bankTransaction.status, status as typeof bankTransaction.status.enumValues[number])
      );
    }

    const transactions = await db.query.bankTransaction.findMany({
      where: and(...conditions),
      orderBy: desc(bankTransaction.date),
      limit,
      offset,
    });

    const [countResult] = await db
      .select({ count: db.$count(bankTransaction) })
      .from(bankTransaction)
      .where(and(...conditions));

    return NextResponse.json(
      paginatedResponse(transactions, Number(countResult?.count || 0), page, limit)
    );
  } catch (err) {
    return handleError(err);
  }
}
