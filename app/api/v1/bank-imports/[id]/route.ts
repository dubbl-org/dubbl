import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { bankStatementImport, bankAccount, bankTransaction } from "@/lib/db/schema";
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

    const importRow = await db.query.bankStatementImport.findFirst({
      where: eq(bankStatementImport.id, id),
      with: { bankAccount: true },
    });

    if (!importRow) return notFound("Bank import");
    if (importRow.bankAccount.organizationId !== ctx.organizationId) {
      return notFound("Bank import");
    }

    const account = await db.query.bankAccount.findFirst({
      where: and(
        eq(bankAccount.id, importRow.bankAccountId),
        eq(bankAccount.organizationId, ctx.organizationId),
        notDeleted(bankAccount.deletedAt)
      ),
    });

    if (!account) return notFound("Bank import");

    const transactions = await db.query.bankTransaction.findMany({
      where: eq(bankTransaction.importId, importRow.id),
      orderBy: (transaction, { desc }) => [desc(transaction.date)],
      limit: 100,
    });

    return NextResponse.json({ import: { ...importRow, transactions } });
  } catch (err) {
    return handleError(err);
  }
}
