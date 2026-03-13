import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  approvalRequest,
  approvalWorkflowStep,
  member,
} from "@/lib/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError } from "@/lib/api/response";
import { parsePagination, paginatedResponse } from "@/lib/api/pagination";

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const url = new URL(request.url);
    const { page, limit, offset } = parsePagination(url);
    const entityType = url.searchParams.get("entityType");
    const status = url.searchParams.get("status");
    const approverId = url.searchParams.get("approverId");

    const conditions: ReturnType<typeof eq>[] = [
      eq(approvalRequest.organizationId, ctx.organizationId),
    ];

    if (entityType) {
      conditions.push(
        eq(
          approvalRequest.entityType,
          entityType as (typeof approvalRequest.entityType.enumValues)[number]
        )
      );
    }

    if (status) {
      conditions.push(
        eq(
          approvalRequest.status,
          status as (typeof approvalRequest.status.enumValues)[number]
        )
      );
    }

    let requests;
    let total: number;

    if (approverId) {
      // Filter to requests where the given member is an approver on the current step
      // We need to join through workflow steps
      const allRequests = await db.query.approvalRequest.findMany({
        where: and(...conditions),
        orderBy: desc(approvalRequest.createdAt),
        with: {
          workflow: {
            with: {
              steps: { with: { approver: { with: { user: true } } } },
            },
          },
          requestedBy: { with: { user: true } },
        },
      });

      const filtered = allRequests.filter((r) => {
        const currentStep = r.workflow.steps.find(
          (s) => s.stepOrder === r.currentStepOrder
        );
        return currentStep?.approverId === approverId;
      });

      total = filtered.length;
      requests = filtered.slice(offset, offset + limit);
    } else {
      requests = await db.query.approvalRequest.findMany({
        where: and(...conditions),
        orderBy: desc(approvalRequest.createdAt),
        limit,
        offset,
        with: {
          workflow: {
            with: {
              steps: { with: { approver: { with: { user: true } } } },
            },
          },
          requestedBy: { with: { user: true } },
        },
      });

      const [countResult] = await db
        .select({ count: sql<number>`count(*)`.mapWith(Number) })
        .from(approvalRequest)
        .where(and(...conditions));

      total = Number(countResult?.count || 0);
    }

    return NextResponse.json(paginatedResponse(requests, total, page, limit));
  } catch (err) {
    return handleError(err);
  }
}
