import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { projectMilestone } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireProjectAccess } from "@/lib/api/project-access";
import { handleError } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { syncProjectBilling } from "@/lib/api/project-billing";
import { z } from "zod";

const createSchema = z.object({
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  amount: z.number().int().min(0).default(0),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);

    await requireProjectAccess(ctx, id, "view");
    // Invoiced amounts come from live invoices (voided/deleted ones release them).
    await syncProjectBilling(db, ctx.organizationId, [id]);

    const milestones = await db.query.projectMilestone.findMany({
      where: eq(projectMilestone.projectId, id),
      orderBy: [asc(projectMilestone.sortOrder), asc(projectMilestone.createdAt)],
    });

    return NextResponse.json({ milestones });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);

    const body = await request.json();
    const parsed = createSchema.parse(body);

    await requireProjectAccess(ctx, id, "manage");

    const [created] = await db
      .insert(projectMilestone)
      .values({
        projectId: id,
        title: parsed.title,
        description: parsed.description || null,
        dueDate: parsed.dueDate || null,
        amount: parsed.amount,
      })
      .returning();

    logAudit({ ctx, action: "create", entityType: "project_milestone", entityId: created.id, request });

    return NextResponse.json({ milestone: created }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
