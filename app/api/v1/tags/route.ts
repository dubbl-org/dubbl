import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tag } from "@/lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(1).max(50),
  color: z.string().default("#6b7280"),
  description: z.string().nullable().optional(),
});

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);

    const tags = await db.query.tag.findMany({
      where: and(
        eq(tag.organizationId, ctx.organizationId),
        isNull(tag.deletedAt)
      ),
      orderBy: tag.name,
    });

    return NextResponse.json({ tags });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);

    const body = await request.json();
    const parsed = createSchema.parse(body);

    const [created] = await db
      .insert(tag)
      .values({
        organizationId: ctx.organizationId,
        name: parsed.name,
        color: parsed.color,
        description: parsed.description || null,
      })
      .returning();

    logAudit({ ctx, action: "create", entityType: "tag", entityId: created.id, request });

    return NextResponse.json({ tag: created }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
