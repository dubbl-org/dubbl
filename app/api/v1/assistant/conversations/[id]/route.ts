import { z } from "zod";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError, notFound, ok } from "@/lib/api/response";
import { deleteConversation, getConversation, renameConversation } from "@/lib/assistant/conversations";

const idSchema = z.string().uuid();

/** GET one conversation with its full transcript. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getAuthContext(request);
    const id = idSchema.safeParse((await params).id);
    if (!id.success) return notFound("Conversation");
    const convo = await getConversation(ctx.organizationId, ctx.userId, id.data);
    if (!convo) return notFound("Conversation");
    return ok({
      conversation: {
        id: convo.id,
        title: convo.title,
        messages: convo.messages,
        pendingResults: convo.pendingResults,
        pending: convo.pending,
        autoApprove: convo.autoApprove,
        createdAt: convo.createdAt,
        updatedAt: convo.updatedAt,
      },
    });
  } catch (err) {
    return handleError(err);
  }
}

/** PATCH { title } renames a conversation. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getAuthContext(request);
    const id = idSchema.safeParse((await params).id);
    if (!id.success) return notFound("Conversation");
    const { title } = z.object({ title: z.string().trim().min(1).max(120) }).parse(await request.json());
    const row = await renameConversation(ctx.organizationId, ctx.userId, id.data, title);
    if (!row) return notFound("Conversation");
    return ok({ conversation: row });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getAuthContext(request);
    const id = idSchema.safeParse((await params).id);
    if (!id.success) return notFound("Conversation");
    if (!(await deleteConversation(ctx.organizationId, ctx.userId, id.data))) return notFound("Conversation");
    return ok({ deleted: true });
  } catch (err) {
    return handleError(err);
  }
}
