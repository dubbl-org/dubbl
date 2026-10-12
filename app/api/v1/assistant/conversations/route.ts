import { getAuthContext } from "@/lib/api/auth-context";
import { handleError, ok } from "@/lib/api/response";
import { clearConversations, listConversations } from "@/lib/assistant/conversations";

/**
 * Your Tilly conversations, newest first.
 *
 * GET    → { conversations: { id, title, waiting, createdAt, updatedAt }[] }
 * DELETE → clears your whole history; returns { deleted: number }
 */
export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    return ok({ conversations: await listConversations(ctx.organizationId, ctx.userId) });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    return ok({ deleted: await clearConversations(ctx.organizationId, ctx.userId) });
  } catch (err) {
    return handleError(err);
  }
}
