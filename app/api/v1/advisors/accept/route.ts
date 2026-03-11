import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { advisorAccess } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { handleError } from "@/lib/api/response";
import { z } from "zod";

const acceptSchema = z.object({
  accessId: z.string().uuid(),
});

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = acceptSchema.parse(body);

    const access = await db.query.advisorAccess.findFirst({
      where: and(
        eq(advisorAccess.id, parsed.accessId),
        eq(advisorAccess.advisorUserId, session.user.id)
      ),
    });

    if (!access) {
      return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
    }

    if (access.revokedAt) {
      return NextResponse.json({ error: "This invitation has been revoked" }, { status: 410 });
    }

    if (access.acceptedAt) {
      return NextResponse.json({ error: "Already accepted" }, { status: 409 });
    }

    const [updated] = await db
      .update(advisorAccess)
      .set({
        acceptedAt: new Date(),
        isActive: true,
      })
      .where(eq(advisorAccess.id, parsed.accessId))
      .returning();

    return NextResponse.json({ access: updated });
  } catch (err) {
    return handleError(err);
  }
}
