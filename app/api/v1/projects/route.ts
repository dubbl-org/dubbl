import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { member, project, projectMember } from "@/lib/db/schema";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { notDeleted } from "@/lib/db/soft-delete";
import { parsePagination, paginatedResponse } from "@/lib/api/pagination";
import { checkResourceLimit } from "@/lib/api/check-limit";
import { z } from "zod";
import { currencyCodeSchema } from "@/lib/currency/zod";
import { syncProjectBilling } from "@/lib/api/project-billing";

const createSchema = z.object({
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  contactId: z.string().nullable().optional(),
  status: z.enum(["active", "completed", "on_hold", "cancelled", "archived"]).default("active"),
  priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
  billingType: z.enum(["hourly", "fixed", "milestone", "non_billable"]).default("hourly"),
  color: z.string().optional(),
  budget: z.number().int().min(0).default(0),
  hourlyRate: z.number().int().min(0).default(0),
  fixedPrice: z.number().int().min(0).default(0),
  estimatedHours: z.number().int().min(0).default(0),
  currency: currencyCodeSchema.default("USD"),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  tags: z.array(z.string()).default([]),
  enableTimeline: z.boolean().default(true),
  enableTasks: z.boolean().default(true),
  enableTimeTracking: z.boolean().default(true),
  enableMilestones: z.boolean().default(false),
  enableNotes: z.boolean().default(true),
  enableBilling: z.boolean().default(true),
});

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const url = new URL(request.url);
    const { page, limit, offset } = parsePagination(url);
    const status = url.searchParams.get("status");
    const priority = url.searchParams.get("priority");

    const conditions = [
      eq(project.organizationId, ctx.organizationId),
      notDeleted(project.deletedAt),
    ];

    if (status) {
      conditions.push(eq(project.status, status as typeof project.status.enumValues[number]));
    }

    // Keep stored totals (hours, billed) in line with time entries and invoices
    // for every project, so the page and the summary below are accurate.
    const allProjects = await db
      .select({ id: project.id })
      .from(project)
      .where(and(eq(project.organizationId, ctx.organizationId), notDeleted(project.deletedAt)));
    await syncProjectBilling(db, ctx.organizationId, allProjects.map((p) => p.id));

    if (priority) {
      conditions.push(eq(project.priority, priority as typeof project.priority.enumValues[number]));
    }

    const projects = await db.query.project.findMany({
      where: and(...conditions),
      orderBy: desc(project.createdAt),
      limit,
      offset,
      with: {
        contact: true,
        members: {
          with: {
            member: {
              with: { user: { columns: { id: true, name: true, email: true, image: true } } },
            },
          },
        },
        tasks: true,
      },
    });

    const [countResult] = await db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(project)
      .where(and(...conditions));

    // Org-wide summary across ALL projects (not just this page or filter).
    const [summary] = await db
      .select({
        total: sql<number>`count(*)`.mapWith(Number),
        active: sql<number>`count(*) filter (where ${project.status} = 'active')`.mapWith(Number),
        totalBudget: sql<number>`COALESCE(SUM(${project.budget}), 0)`.mapWith(Number),
        totalBilled: sql<number>`COALESCE(SUM(${project.totalBilled}), 0)`.mapWith(Number),
        totalHours: sql<number>`COALESCE(SUM(${project.totalHours}), 0)`.mapWith(Number),
      })
      .from(project)
      .where(and(eq(project.organizationId, ctx.organizationId), notDeleted(project.deletedAt)));
    const [memberCount] = allProjects.length
      ? await db
          .select({ count: sql<number>`count(distinct ${projectMember.memberId})`.mapWith(Number) })
          .from(projectMember)
          .where(inArray(projectMember.projectId, allProjects.map((p) => p.id)))
      : [{ count: 0 }];

    return NextResponse.json({
      ...paginatedResponse(projects, Number(countResult?.count || 0), page, limit),
      summary: { ...summary, teamMembers: memberCount?.count ?? 0 },
    });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:projects");

    const body = await request.json();
    const parsed = createSchema.parse(body);

    await checkResourceLimit(ctx.organizationId, project, project.organizationId, "projects", project.deletedAt);

    const [created] = await db
      .insert(project)
      .values({
        organizationId: ctx.organizationId,
        name: parsed.name,
        description: parsed.description || null,
        contactId: parsed.contactId || null,
        status: parsed.status,
        priority: parsed.priority,
        billingType: parsed.billingType,
        color: parsed.color || "#10b981",
        budget: parsed.budget,
        hourlyRate: parsed.hourlyRate,
        fixedPrice: parsed.fixedPrice,
        estimatedHours: parsed.estimatedHours,
        currency: parsed.currency,
        startDate: parsed.startDate || null,
        endDate: parsed.endDate || null,
        category: parsed.category || null,
        tags: parsed.tags,
        enableTimeline: parsed.enableTimeline,
        enableTasks: parsed.enableTasks,
        enableTimeTracking: parsed.enableTimeTracking,
        // Milestone-billed projects are invoiced from their milestones.
        enableMilestones: parsed.enableMilestones || parsed.billingType === "milestone",
        enableNotes: parsed.enableNotes,
        enableBilling: parsed.enableBilling,
      })
      .returning();

    // The person who creates a project manages it.
    const creator = await db.query.member.findFirst({
      where: and(eq(member.organizationId, ctx.organizationId), eq(member.userId, ctx.userId)),
      columns: { id: true },
    });
    if (creator) {
      await db.insert(projectMember).values({ projectId: created.id, memberId: creator.id, role: "manager" });
    }

    logAudit({ ctx, action: "create", entityType: "project", entityId: created.id, request });

    return NextResponse.json({ project: created }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
