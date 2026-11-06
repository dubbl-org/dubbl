import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { projectLabel } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireProjectAccess } from "@/lib/api/project-access";
import { handleError } from "@/lib/api/response";
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

    await requireProjectAccess(ctx, id, "view");

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

    const body = await request.json();
    const parsed = createSchema.parse(body);

    await requireProjectAccess(ctx, id, "manage");

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

    await requireProjectAccess(ctx, id, "manage");

    const url = new URL(request.url);
    const labelId = url.searchParams.get("labelId");
    if (!labelId) return NextResponse.json({ error: "labelId required" }, { status: 400 });

    await db.delete(projectLabel).where(and(eq(projectLabel.id, labelId), eq(projectLabel.projectId, id)));
    return NextResponse.json({ success: true });
  } catch (err) { return handleError(err); }
}
