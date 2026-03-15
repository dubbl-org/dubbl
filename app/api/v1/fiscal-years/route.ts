import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fiscalYear } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getAuthContext, AuthError } from "@/lib/api/auth-context";
import { logAudit } from "@/lib/api/audit";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(1),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
});

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);

    const years = await db.query.fiscalYear.findMany({
      where: eq(fiscalYear.organizationId, ctx.organizationId),
      orderBy: fiscalYear.startDate,
    });

    return NextResponse.json({ fiscalYears: years });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const body = await request.json();
    const parsed = createSchema.parse(body);

    const [year] = await db
      .insert(fiscalYear)
      .values({
        organizationId: ctx.organizationId,
        ...parsed,
      })
      .returning();

    logAudit({ ctx, action: "create", entityType: "fiscal_year", entityId: year.id, request });

    return NextResponse.json({ fiscalYear: year }, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues.map((i) => i.message).join(", ") }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
