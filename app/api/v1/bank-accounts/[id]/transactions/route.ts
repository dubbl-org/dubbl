import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bankAccount, bankTransaction } from "@/lib/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
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

    const rows = await db.query.bankTransaction.findMany({
      where: and(...conditions),
      orderBy: desc(bankTransaction.date),
      limit,
      offset,
      with: {
        import: true,
        // Linked ledger account (set when the transaction is categorized/matched);
        // used to surface the account code+name in the UI.
        account: {
          columns: { id: true, code: true, name: true },
        },
      },
    });

    // Flatten the linked account into accountCode/accountName while keeping the
    // existing fields (accountId, journalEntryId, reconciliationId are columns).
    const transactions = rows.map(({ account, ...tx }) => ({
      ...tx,
      accountCode: account?.code ?? null,
      accountName: account?.name ?? null,
    }));

    const [countResult] = await db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(bankTransaction)
      .where(and(...conditions));

    return NextResponse.json(
      paginatedResponse(transactions, Number(countResult?.count || 0), page, limit)
    );
  } catch (err) {
    return handleError(err);
  }
}
