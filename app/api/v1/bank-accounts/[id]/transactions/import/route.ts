import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bankAccount, bankTransaction } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound, validationError } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { parseBankCSV } from "@/lib/banking/csv-parser";

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
    const csvText = body.csv;

    if (!csvText || typeof csvText !== "string") {
      return validationError("CSV data is required");
    }

    let parsed;
    try {
      parsed = parseBankCSV(csvText);
    } catch (err) {
      return validationError(
        err instanceof Error ? err.message : "Failed to parse CSV"
      );
    }

    if (parsed.length === 0) {
      return validationError("No transactions found in CSV");
    }

    // Calculate running balance
    let runningBalance = account.balance;
    const rows = parsed.map((tx) => {
      runningBalance += tx.amount;
      return {
        bankAccountId: id,
        date: tx.date,
        description: tx.description,
        reference: tx.reference || null,
        amount: tx.amount,
        balance: runningBalance,
      };
    });

    const inserted = await db
      .insert(bankTransaction)
      .values(rows)
      .returning();

    // Update account balance
    await db
      .update(bankAccount)
      .set({ balance: runningBalance })
      .where(eq(bankAccount.id, id));

    return NextResponse.json(
      { imported: inserted.length, transactions: inserted },
      { status: 201 }
    );
  } catch (err) {
    return handleError(err);
  }
}
