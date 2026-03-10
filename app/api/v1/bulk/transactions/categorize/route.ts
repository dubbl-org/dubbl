import { db } from "@/lib/db";
import { bankTransaction, bankAccount } from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { ok, handleError } from "@/lib/api/response";
import { z } from "zod";

const schema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100),
  accountId: z.string().uuid(),
});

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:banking");

    const body = await request.json();
    const { ids, accountId } = schema.parse(body);

    // Get org's bank account IDs for authorization
    const orgAccounts = await db.query.bankAccount.findMany({
      where: eq(bankAccount.organizationId, ctx.organizationId),
      columns: { id: true },
    });
    const orgAccountIds = orgAccounts.map((a) => a.id);

    if (orgAccountIds.length === 0) {
      return ok({ updated: 0 });
    }

    const updated = await db
      .update(bankTransaction)
      .set({ accountId })
      .where(
        and(
          inArray(bankTransaction.id, ids),
          inArray(bankTransaction.bankAccountId, orgAccountIds)
        )
      )
      .returning({ id: bankTransaction.id });

    return ok({ updated: updated.length });
  } catch (err) {
    return handleError(err);
  }
}
