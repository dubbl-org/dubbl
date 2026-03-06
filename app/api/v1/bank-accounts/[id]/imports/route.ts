import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { bankAccount } from "@/lib/db/schema";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError, notFound } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { listBankStatementImports } from "@/lib/banking/importer";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);

    const account = await db.query.bankAccount.findFirst({
      where: and(
        eq(bankAccount.id, id),
        eq(bankAccount.organizationId, ctx.organizationId),
        notDeleted(bankAccount.deletedAt)
      ),
    });

    if (!account) return notFound("Bank account");

    const imports = await listBankStatementImports(id);
    return NextResponse.json({ imports });
  } catch (err) {
    return handleError(err);
  }
}
