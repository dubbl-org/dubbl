import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { advisorAccess, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { z } from "zod";

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["accountant", "auditor", "tax_advisor", "bookkeeper"]).default("accountant"),
});

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:members");

    const body = await request.json();
    const parsed = inviteSchema.parse(body);

    // Find user by email
    const user = await db.query.users.findFirst({
      where: eq(users.email, parsed.email),
    });

    if (!user) {
      return NextResponse.json(
        { error: "No account found with this email. The advisor must create an account first." },
        { status: 404 }
      );
    }

    // Create advisor access (pending acceptance)
    const [access] = await db
      .insert(advisorAccess)
      .values({
        advisorUserId: user.id,
        organizationId: ctx.organizationId,
        role: parsed.role,
        inviteEmail: parsed.email,
        grantedBy: ctx.userId,
        isActive: false, // becomes active on acceptance
      })
      .onConflictDoUpdate({
        target: [advisorAccess.advisorUserId, advisorAccess.organizationId],
        set: {
          role: parsed.role,
          isActive: false,
          revokedAt: null,
          acceptedAt: null,
          invitedAt: new Date(),
          grantedBy: ctx.userId,
        },
      })
      .returning();

    return NextResponse.json({ access }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
