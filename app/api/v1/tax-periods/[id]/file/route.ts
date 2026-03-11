import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { taxPeriod } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { z } from "zod";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:tax-config");
    const { id } = await params;
    const body = await request.json();
    const { filedReference } = z.object({ filedReference: z.string().optional() }).parse(body);

    const [updated] = await db
      .update(taxPeriod)
      .set({
        status: "filed",
        filedAt: new Date(),
        filedBy: ctx.userId,
        filedReference: filedReference || null,
        updatedAt: new Date(),
      })
      .where(and(
        eq(taxPeriod.id, id),
        eq(taxPeriod.organizationId, ctx.organizationId),
        eq(taxPeriod.status, "open")
      ))
      .returning();

    if (!updated) return notFound("Tax period");
    return NextResponse.json(updated);
  } catch (err) {
    return handleError(err);
  }
}
