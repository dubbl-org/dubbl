import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { applyDebitNote, DebitNoteError } from "@/lib/api/debit-notes";
import { z } from "zod";

const applySchema = z.object({
  billId: z.string().min(1),
  amount: z.number().int().min(1),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:debit-notes");

    const body = await request.json();
    const parsed = applySchema.parse(body);

    // Open-item offset only (AP was relieved when the credit was sent); records
    // a carrier payment + allocations so a void can give the amount back.
    const result = await applyDebitNote(ctx, id, parsed.billId, parsed.amount);

    logAudit({ ctx, action: "apply", entityType: "debit_note", entityId: id, changes: { previousStatus: result.previousStatus, billId: parsed.billId, amount: parsed.amount }, request });

    return NextResponse.json({ debitNote: result.debitNote, bill: result.bill });
  } catch (err) {
    if (err instanceof DebitNoteError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return handleError(err);
  }
}
