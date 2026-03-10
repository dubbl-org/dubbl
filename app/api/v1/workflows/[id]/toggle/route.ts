import { db } from "@/lib/db";
import { workflow } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { notDeleted } from "@/lib/db/soft-delete";
import { ok, notFound, handleError } from "@/lib/api/response";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);

    const existing = await db.query.workflow.findFirst({
      where: and(
        eq(workflow.id, id),
        eq(workflow.organizationId, ctx.organizationId),
        notDeleted(workflow.deletedAt),
      ),
    });
    if (!existing) return notFound("Workflow");

    const [updated] = await db
      .update(workflow)
      .set({ isActive: !existing.isActive, updatedAt: new Date() })
      .where(eq(workflow.id, id))
      .returning();

    return ok({ workflow: updated });
  } catch (err) {
    return handleError(err);
  }
}
