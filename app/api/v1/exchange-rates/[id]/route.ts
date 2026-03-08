import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { exchangeRate } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { z } from "zod";

const updateSchema = z.object({
  rate: z.number().int().positive().optional(),
  source: z.enum(["manual", "api"]).optional(),
});

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:settings");

    const body = await request.json();
    const parsed = updateSchema.parse(body);

    const existing = await db.query.exchangeRate.findFirst({
      where: and(
        eq(exchangeRate.id, id),
        eq(exchangeRate.organizationId, ctx.organizationId)
      ),
    });

    if (!existing) return notFound("Exchange rate");

    const [updated] = await db
      .update(exchangeRate)
      .set(parsed)
      .where(eq(exchangeRate.id, id))
      .returning();

    return NextResponse.json({ exchangeRate: updated });
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

    const existing = await db.query.exchangeRate.findFirst({
      where: and(
        eq(exchangeRate.id, id),
        eq(exchangeRate.organizationId, ctx.organizationId)
      ),
    });

    if (!existing) return notFound("Exchange rate");

    await db.delete(exchangeRate).where(eq(exchangeRate.id, id));

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
