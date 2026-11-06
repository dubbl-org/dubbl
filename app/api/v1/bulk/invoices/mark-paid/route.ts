import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { ok, handleError } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { markInvoicesPaid } from "@/lib/api/invoice-payment";
import { z } from "zod";

const schema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100),
  /** Payment date (YYYY-MM-DD); defaults to today. */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  /** Bank account the money went into; defaults to the main bank account. */
  bankAccountId: z.string().uuid().nullable().optional(),
});

/**
 * Mark invoices paid in full. Each one gets a real payment for what it still
 * owes (payment record + DR Bank / CR Accounts Receivable), so the bank and
 * receivables stay right. Drafts, void and already-paid invoices are skipped
 * with a reason.
 */
export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:payments");

    const body = await request.json();
    const { ids, date, bankAccountId } = schema.parse(body);

    const results = await markInvoicesPaid(ctx, ids, { date, bankAccountId });
    const paidIds = results.filter((r) => r.success).map((r) => r.id);

    // Each payment sends payment.received and invoice.paid itself.
    await logAudit({ ctx, action: "pay", entityType: "invoice", entityId: ctx.organizationId,
      changes: { count: paidIds.length, ids: paidIds }, request });

    return ok({ updated: paidIds.length, results });
  } catch (err) {
    return handleError(err);
  }
}
