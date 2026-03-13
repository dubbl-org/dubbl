import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { customRole, member } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { ALL_PERMISSIONS } from "@/lib/plans";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).nullable().optional(),
  permissions: z.array(z.string().refine((p) => ALL_PERMISSIONS.includes(p), {
    message: "Invalid permission",
  })).min(1),
});

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);

    const roles = await db.query.customRole.findMany({
      where: eq(customRole.organizationId, ctx.organizationId),
    });

    // Get member counts per role
    const rolesWithCounts = await Promise.all(
      roles.map(async (role) => {
        const [result] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(member)
          .where(
            and(
              eq(member.organizationId, ctx.organizationId),
              eq(member.customRoleId, role.id)
            )
          );
        return { ...role, memberCount: result?.count ?? 0 };
      })
    );

    return NextResponse.json({ roles: rolesWithCounts });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "change:roles");

    const body = await request.json();
    const parsed = createSchema.parse(body);

    const [created] = await db
      .insert(customRole)
      .values({
        organizationId: ctx.organizationId,
        name: parsed.name,
        description: parsed.description || null,
        permissions: parsed.permissions,
      })
      .returning();

    return NextResponse.json({ role: created }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
