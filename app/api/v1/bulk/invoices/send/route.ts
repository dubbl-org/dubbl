import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { ok, handleError } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { postDraftInvoices } from "@/lib/api/invoice-send";
import { z } from "zod";

const schema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100),
});

/**
 * Mark draft invoices as sent without emailing them. Each one is posted to
 * the ledger (DR Accounts Receivable / CR income and tax, plus cost of goods
 * sold for stock lines) exactly like sending it one by one. Invoices that
 * aren't drafts or fall in a locked period are skipped with a reason.
 */
export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "approve:invoices");

    const body = await request.json();
    const { ids } = schema.parse(body);

    const results = await postDraftInvoices(ctx, ids);
    const sentIds = results.filter((r) => r.success).map((r) => r.id);

    await logAudit({ ctx, action: "send", entityType: "invoice", entityId: ctx.organizationId,
      changes: { count: sentIds.length, ids: sentIds }, request });

    return ok({ updated: sentIds.length, ids: sentIds, results });
  } catch (err) {
    return handleError(err);
  }
}
