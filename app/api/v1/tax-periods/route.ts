import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { taxPeriod } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(1),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  type: z.enum(["monthly", "quarterly", "annual"]),
  notes: z.string().optional(),
});

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);

    const periods = await db.query.taxPeriod.findMany({
      where: eq(taxPeriod.organizationId, ctx.organizationId),
      orderBy: desc(taxPeriod.startDate),
      with: { lines: true },
    });

    return NextResponse.json({ taxPeriods: periods });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:settings");

    const body = await request.json();
    const parsed = createSchema.parse(body);

    const [created] = await db
      .insert(taxPeriod)
      .values({
        organizationId: ctx.organizationId,
        ...parsed,
      })
      .returning();

    return NextResponse.json({ taxPeriod: created }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
