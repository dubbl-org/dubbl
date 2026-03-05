import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { project } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { parsePagination, paginatedResponse } from "@/lib/api/pagination";
import { z } from "zod";

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
  currency: z.string().default("USD"),
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
              with: { user: true },
            },
          },
        },
      },
    });

    const [countResult] = await db
      .select({ count: db.$count(project) })
      .from(project)
      .where(and(...conditions));

    return NextResponse.json(
      paginatedResponse(projects, Number(countResult?.count || 0), page, limit)
    );
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
        enableMilestones: parsed.enableMilestones,
        enableNotes: parsed.enableNotes,
        enableBilling: parsed.enableBilling,
      })
      .returning();

    return NextResponse.json({ project: created }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
