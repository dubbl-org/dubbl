import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { organization } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { z } from "zod";

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const org = await db.query.organization.findFirst({
      where: eq(organization.id, ctx.organizationId),
    });
    return NextResponse.json({ mileageRate: org?.mileageRate ?? 67 });
  } catch (err) {
    return handleError(err);
  }
}

export async function PUT(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:tax-config");
    const body = await request.json();
    const { mileageRate } = z
      .object({ mileageRate: z.number().int().min(0) })
      .parse(body);

    const [updated] = await db
      .update(organization)
      .set({ mileageRate, updatedAt: new Date() })
      .where(eq(organization.id, ctx.organizationId))
      .returning();

    return NextResponse.json({ mileageRate: updated.mileageRate });
  } catch (err) {
    return handleError(err);
  }
}
