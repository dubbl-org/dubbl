import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { project, projectLabel } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(1),
  color: z.string().default("#6366f1"),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);

    const proj = await db.query.project.findFirst({
      where: and(eq(project.id, id), eq(project.organizationId, ctx.organizationId), notDeleted(project.deletedAt)),
    });
    if (!proj) return notFound("Project");

    const labels = await db.query.projectLabel.findMany({
      where: eq(projectLabel.projectId, id),
    });

    return NextResponse.json({ labels });
  } catch (err) { return handleError(err); }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:projects");

    const body = await request.json();
    const parsed = createSchema.parse(body);

    const proj = await db.query.project.findFirst({
      where: and(eq(project.id, id), eq(project.organizationId, ctx.organizationId), notDeleted(project.deletedAt)),
    });
    if (!proj) return notFound("Project");

    const [created] = await db.insert(projectLabel).values({
      projectId: id,
      name: parsed.name,
      color: parsed.color,
    }).returning();

    return NextResponse.json({ label: created }, { status: 201 });
  } catch (err) { return handleError(err); }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:projects");

    const proj = await db.query.project.findFirst({
      where: and(eq(project.id, id), eq(project.organizationId, ctx.organizationId), notDeleted(project.deletedAt)),
    });
    if (!proj) return notFound("Project");

    const url = new URL(request.url);
    const labelId = url.searchParams.get("labelId");
    if (!labelId) return NextResponse.json({ error: "labelId required" }, { status: 400 });

    await db.delete(projectLabel).where(eq(projectLabel.id, labelId));
    return NextResponse.json({ success: true });
  } catch (err) { return handleError(err); }
}
