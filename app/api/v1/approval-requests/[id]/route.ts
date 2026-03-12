import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { approvalRequest, approvalWorkflowStep, approvalAction } from "@/lib/db/schema";
import { eq, and, asc } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError, notFound } from "@/lib/api/response";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);

    const found = await db.query.approvalRequest.findFirst({
      where: and(
        eq(approvalRequest.id, id),
        eq(approvalRequest.organizationId, ctx.organizationId)
      ),
      with: {
        workflow: {
          with: {
            steps: {
              orderBy: asc(approvalWorkflowStep.stepOrder),
              with: { approver: { with: { user: true } } },
            },
          },
        },
        requestedBy: { with: { user: true } },
        actions: {
          orderBy: asc(approvalAction.createdAt),
          with: { user: { with: { user: true } }, step: true },
        },
      },
    });

    if (!found) return notFound("Approval request");
    return NextResponse.json({ request: found });
  } catch (err) {
    return handleError(err);
  }
}
