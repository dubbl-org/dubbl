import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, ok } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { removeReviewEntry } from "@/lib/api/compensation-reviews";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; entryId: string }> }
) {
  try {
    const { id, entryId } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:compensation");

    await removeReviewEntry(ctx, id, entryId);

    logAudit({ ctx, action: "delete", entityType: "compensationReviewEntry", entityId: entryId, request });

    return ok({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
