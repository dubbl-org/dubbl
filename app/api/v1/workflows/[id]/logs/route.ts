import { db } from "@/lib/db";
import { workflow, workflowExecutionLog } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { notDeleted } from "@/lib/db/soft-delete";
import { ok, notFound, handleError } from "@/lib/api/response";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);

    const wf = await db.query.workflow.findFirst({
      where: and(
        eq(workflow.id, id),
        eq(workflow.organizationId, ctx.organizationId),
        notDeleted(workflow.deletedAt),
      ),
    });
    if (!wf) return notFound("Workflow");

    const logs = await db.query.workflowExecutionLog.findMany({
      where: eq(workflowExecutionLog.workflowId, id),
      orderBy: desc(workflowExecutionLog.executedAt),
      limit: 100,
    });

    return ok({ logs });
  } catch (err) {
    return handleError(err);
  }
}
