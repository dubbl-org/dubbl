import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { processRecurringJournals } from "@/lib/api/recurring-generate";

/**
 * Manually run the recurring-journal scheduler for the caller's org now, posting
 * a balanced, posted manual journal entry for every due occurrence of every
 * active journal template (catching up if behind). Mirrors what the daily
 * recurring-journals task does, scoped to this org. Returns the number of
 * journal entries posted.
 */
export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:recurring");

    const posted = await processRecurringJournals(ctx.organizationId);

    logAudit({
      ctx,
      action: "run",
      entityType: "recurring_journal",
      entityId: ctx.organizationId,
      changes: { posted },
      request,
    });

    return NextResponse.json({ posted });
  } catch (err) {
    return handleError(err);
  }
}
