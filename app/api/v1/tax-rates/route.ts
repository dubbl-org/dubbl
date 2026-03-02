import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { taxRate } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(1),
  rate: z.number().int().min(0), // basis points: 1000 = 10%
  type: z.enum(["sales", "purchase", "both"]).default("both"),
  isDefault: z.boolean().default(false),
});

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);

    const rates = await db.query.taxRate.findMany({
      where: and(
        eq(taxRate.organizationId, ctx.organizationId),
        notDeleted(taxRate.deletedAt)
      ),
      with: { components: true },
    });

    return NextResponse.json({ taxRates: rates });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:tax-rates");

    const body = await request.json();
    const parsed = createSchema.parse(body);

    const [created] = await db
      .insert(taxRate)
      .values({
        organizationId: ctx.organizationId,
        ...parsed,
      })
      .returning();

    return NextResponse.json({ taxRate: created }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
