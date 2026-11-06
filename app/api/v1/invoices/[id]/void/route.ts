import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { InvoiceVoidError, voidInvoice } from "@/lib/api/invoice-void";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "approve:invoices");

    const { invoice: updated, previousStatus } = await voidInvoice(ctx, id);

    logAudit({ ctx, action: "void", entityType: "invoice", entityId: id, changes: { previousStatus }, request });

    return NextResponse.json({ invoice: updated });
  } catch (err) {
    if (err instanceof InvoiceVoidError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return handleError(err);
  }
}
