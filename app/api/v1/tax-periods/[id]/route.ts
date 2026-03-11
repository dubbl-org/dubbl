import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { taxPeriod } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { z } from "zod";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);

    const found = await db.query.taxPeriod.findFirst({
      where: and(
        eq(taxPeriod.id, id),
        eq(taxPeriod.organizationId, ctx.organizationId)
      ),
      with: { lines: true },
    });

    if (!found) return notFound("Tax period");
    return NextResponse.json({ taxPeriod: found });
  } catch (err) {
    return handleError(err);
  }
}

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  startDate: z.string().min(1).optional(),
  endDate: z.string().min(1).optional(),
  type: z.enum(["monthly", "quarterly", "annual"]).optional(),
  notes: z.string().nullable().optional(),
});

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:settings");

    const existing = await db.query.taxPeriod.findFirst({
      where: and(
        eq(taxPeriod.id, id),
        eq(taxPeriod.organizationId, ctx.organizationId)
      ),
    });

    if (!existing) return notFound("Tax period");

    const body = await request.json();
    const parsed = updateSchema.parse(body);

    const [updated] = await db
      .update(taxPeriod)
      .set({ ...parsed, updatedAt: new Date() })
      .where(eq(taxPeriod.id, id))
      .returning();

    return NextResponse.json({ taxPeriod: updated });
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
    requireRole(ctx, "manage:settings");

    const existing = await db.query.taxPeriod.findFirst({
      where: and(
        eq(taxPeriod.id, id),
        eq(taxPeriod.organizationId, ctx.organizationId)
      ),
    });

    if (!existing) return notFound("Tax period");

    await db.delete(taxPeriod).where(eq(taxPeriod.id, id));

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
