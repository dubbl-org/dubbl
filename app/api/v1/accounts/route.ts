import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { chartAccount } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext, AuthError } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { z } from "zod";

const createSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(["asset", "liability", "equity", "revenue", "expense"]),
  subType: z.string().nullable().optional(),
  parentId: z.string().nullable().optional(),
  currencyCode: z.string().default("USD"),
  description: z.string().nullable().optional(),
});

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);

    const accounts = await db.query.chartAccount.findMany({
      where: eq(chartAccount.organizationId, ctx.organizationId),
      orderBy: chartAccount.code,
    });

    return NextResponse.json({ accounts });
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
    requireRole(ctx, "manage:accounts");

    const body = await request.json();
    const parsed = createSchema.parse(body);

    // Check for duplicate code
    const existing = await db.query.chartAccount.findFirst({
      where: and(
        eq(chartAccount.organizationId, ctx.organizationId),
        eq(chartAccount.code, parsed.code)
      ),
    });
    if (existing) {
      return NextResponse.json(
        { error: "Account code already exists" },
        { status: 409 }
      );
    }

    const [account] = await db
      .insert(chartAccount)
      .values({
        organizationId: ctx.organizationId,
        ...parsed,
      })
      .returning();

    return NextResponse.json({ account }, { status: 201 });
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
