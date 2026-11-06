import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { voidDebitNote, DebitNoteError } from "@/lib/api/debit-notes";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:debit-notes");

    // Reverses the send posting and gives any applied amounts back to the bills.
    const { debitNote: updated, previousStatus } = await voidDebitNote(ctx, id);

    logAudit({ ctx, action: "void", entityType: "debit_note", entityId: id, changes: { previousStatus }, request });

    return NextResponse.json({ debitNote: updated });
  } catch (err) {
    if (err instanceof DebitNoteError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return handleError(err);
  }
}
