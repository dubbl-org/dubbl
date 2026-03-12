import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { approvalWorkflow, approvalWorkflowStep } from "@/lib/db/schema";
import { eq, and, desc, sql, asc } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { parsePagination, paginatedResponse } from "@/lib/api/pagination";
import { z } from "zod";

const stepSchema = z.object({
  approverId: z.string().uuid(),
  isRequired: z.boolean().default(true),
});

const createSchema = z.object({
  name: z.string().min(1),
  entityType: z.enum([
    "bill",
    "expense",
    "invoice",
    "journal_entry",
    "purchase_order",
  ]),
  conditions: z
    .array(
      z.object({
        field: z.string().min(1),
        operator: z.enum(["eq", "neq", "gt", "lt", "gte", "lte"]),
        value: z.string(),
      })
    )
    .default([]),
  isActive: z.boolean().default(true),
  steps: z.array(stepSchema).min(1),
});

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const url = new URL(request.url);
    const { page, limit, offset } = parsePagination(url);
    const entityType = url.searchParams.get("entityType");

    const conditions = [
      eq(approvalWorkflow.organizationId, ctx.organizationId),
      notDeleted(approvalWorkflow.deletedAt),
    ];

    if (entityType) {
      conditions.push(
        eq(
          approvalWorkflow.entityType,
          entityType as (typeof approvalWorkflow.entityType.enumValues)[number]
        )
      );
    }

    const workflows = await db.query.approvalWorkflow.findMany({
      where: and(...conditions),
      orderBy: desc(approvalWorkflow.createdAt),
      limit,
      offset,
      with: {
        steps: {
          orderBy: asc(approvalWorkflowStep.stepOrder),
          with: { approver: { with: { user: true } } },
        },
      },
    });

    const [countResult] = await db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(approvalWorkflow)
      .where(and(...conditions));

    return NextResponse.json(
      paginatedResponse(
        workflows,
        Number(countResult?.count || 0),
        page,
        limit
      )
    );
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:bills");

    const body = await request.json();
    const parsed = createSchema.parse(body);

    const [workflow] = await db
      .insert(approvalWorkflow)
      .values({
        organizationId: ctx.organizationId,
        name: parsed.name,
        entityType: parsed.entityType,
        conditions: parsed.conditions,
        isActive: parsed.isActive,
      })
      .returning();

    if (parsed.steps.length > 0) {
      await db.insert(approvalWorkflowStep).values(
        parsed.steps.map((step, i) => ({
          workflowId: workflow.id,
          stepOrder: i + 1,
          approverId: step.approverId,
          isRequired: step.isRequired,
        }))
      );
    }

    const created = await db.query.approvalWorkflow.findFirst({
      where: eq(approvalWorkflow.id, workflow.id),
      with: {
        steps: {
          orderBy: asc(approvalWorkflowStep.stepOrder),
          with: { approver: { with: { user: true } } },
        },
      },
    });

    return NextResponse.json({ workflow: created }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
