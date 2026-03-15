import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { project } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { notDeleted, softDelete } from "@/lib/db/soft-delete";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  contactId: z.string().nullable().optional(),
  status: z.enum(["active", "completed", "on_hold", "cancelled", "archived"]).optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  billingType: z.enum(["hourly", "fixed", "milestone", "non_billable"]).optional(),
  color: z.string().optional(),
  budget: z.number().int().min(0).optional(),
  hourlyRate: z.number().int().min(0).optional(),
  fixedPrice: z.number().int().min(0).optional(),
  estimatedHours: z.number().int().min(0).optional(),
  currency: z.string().optional(),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  enableTimeline: z.boolean().optional(),
  enableTasks: z.boolean().optional(),
  enableTimeTracking: z.boolean().optional(),
  enableMilestones: z.boolean().optional(),
  enableNotes: z.boolean().optional(),
  enableBilling: z.boolean().optional(),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);

    const found = await db.query.project.findFirst({
      where: and(
        eq(project.id, id),
        eq(project.organizationId, ctx.organizationId),
        notDeleted(project.deletedAt)
      ),
      with: {
        contact: true,
        timeEntries: {
          with: { user: true, task: true },
        },
        members: {
          with: {
            member: {
              with: { user: true },
            },
          },
        },
        tasks: {
          with: {
            assignee: { with: { user: true } },
            team: true,
            createdBy: true,
            checklist: true,
            comments: { with: { author: true } },
          },
        },
        labels: true,
        teams: {
          with: {
            members: {
              with: { member: { with: { user: true } } },
            },
          },
        },
        milestones: true,
        notes: {
          with: { author: true },
        },
        runningTimers: {
          with: { task: true },
        },
      },
    });

    if (!found) return notFound("Project");
    return NextResponse.json({ project: found });
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:projects");

    const body = await request.json();
    const parsed = updateSchema.parse(body);

    const existing = await db.query.project.findFirst({
      where: and(
        eq(project.id, id),
        eq(project.organizationId, ctx.organizationId),
        notDeleted(project.deletedAt)
      ),
    });

    if (!existing) return notFound("Project");

    const [updated] = await db
      .update(project)
      .set({ ...parsed, updatedAt: new Date() })
      .where(eq(project.id, id))
      .returning();

    return NextResponse.json({ project: updated });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:projects");

    const existing = await db.query.project.findFirst({
      where: and(
        eq(project.id, id),
        eq(project.organizationId, ctx.organizationId),
        notDeleted(project.deletedAt)
      ),
    });

    if (!existing) return notFound("Project");

    await db
      .update(project)
      .set(softDelete())
      .where(eq(project.id, id));

    logAudit({
      ctx,
      action: "delete",
      entityType: "project",
      entityId: id,
      changes: existing as Record<string, unknown>,
      request,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
