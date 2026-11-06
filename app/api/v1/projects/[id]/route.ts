import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { project, runningTimer } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError, notFound } from "@/lib/api/response";
import { getProjectAccess, requireProjectAccess } from "@/lib/api/project-access";
import { syncProjectBilling } from "@/lib/api/project-billing";
import { logAudit, diffChanges } from "@/lib/api/audit";
import { notDeleted, softDelete } from "@/lib/db/soft-delete";
import { z } from "zod";
import { currencyCodeSchema } from "@/lib/currency/zod";

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
  currency: currencyCodeSchema.optional(),
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

    // Release work from voided/deleted invoices and refresh stored totals first.
    const totals = await syncProjectBilling(db, ctx.organizationId, [id]);

    const found = await db.query.project.findFirst({
      where: and(
        eq(project.id, id),
        eq(project.organizationId, ctx.organizationId),
        notDeleted(project.deletedAt)
      ),
      with: {
        contact: true,
        timeEntries: {
          with: { user: { columns: { id: true, name: true, email: true, image: true } }, task: true },
          orderBy: (t, { desc }) => [desc(t.date), desc(t.createdAt)],
        },
        members: {
          with: {
            member: {
              with: { user: { columns: { id: true, name: true, email: true, image: true } } },
            },
          },
        },
        tasks: {
          with: {
            assignee: { with: { user: { columns: { id: true, name: true, email: true, image: true } } } },
            team: true,
            createdBy: { columns: { id: true, name: true, email: true, image: true } },
            checklist: true,
            comments: { with: { author: { columns: { id: true, name: true, email: true, image: true } } } },
          },
        },
        labels: true,
        teams: {
          with: {
            members: {
              with: { member: { with: { user: { columns: { id: true, name: true, email: true, image: true } } } } },
            },
          },
        },
        milestones: true,
        notes: {
          with: { author: { columns: { id: true, name: true, email: true, image: true } } },
          orderBy: (n, { desc }) => [desc(n.createdAt)],
        },
        // Timers are personal: only the caller's own running timer.
        runningTimers: {
          where: eq(runningTimer.userId, ctx.userId),
          with: { task: true },
        },
      },
    });

    if (!found) return notFound("Project");
    const access = await getProjectAccess(ctx, id);
    return NextResponse.json({
      project: {
        ...found,
        // Cents on draft / awaiting-approval invoices (not yet in totalBilled).
        unissuedBilled: totals.get(id)?.unissuedBilled ?? 0,
        // What the caller may do here: "view" | "contribute" | "manage".
        access,
        // The caller's user id, so the UI knows which time entries and notes are theirs.
        viewerUserId: ctx.userId,
      },
    });
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

    const body = await request.json();
    const parsed = updateSchema.parse(body);

    const { project: existing } = await requireProjectAccess(ctx, id, "manage");

    const updates = { ...parsed };
    // Milestone-billed projects are invoiced from their milestones.
    if (parsed.billingType === "milestone") updates.enableMilestones = true;

    const [updated] = await db
      .update(project)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(project.id, id))
      .returning();

    logAudit({ ctx, action: "update", entityType: "project", entityId: id, changes: diffChanges(existing as Record<string, unknown>, updated as Record<string, unknown>), request });

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
    const { project: existing } = await requireProjectAccess(ctx, id, "manage");

    // Soft delete: the project moves to Trash and can be restored from there.
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
