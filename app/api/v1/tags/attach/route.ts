import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { entityTag, tag } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError, notFound } from "@/lib/api/response";
import { TAGGABLE_ENTITY_TYPES, taggableEntityExists } from "@/lib/api/tags";
import { z } from "zod";

const schema = z.object({
  tagId: z.string().uuid(),
  entityType: z.enum(TAGGABLE_ENTITY_TYPES),
  entityId: z.string().uuid(),
});

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);

    const body = await request.json();
    const parsed = schema.parse(body);

    // Verify tag belongs to org
    const t = await db.query.tag.findFirst({
      where: eq(tag.id, parsed.tagId),
    });
    if (!t || t.organizationId !== ctx.organizationId || t.deletedAt) {
      return notFound("Tag");
    }
    if (!(await taggableEntityExists(ctx.organizationId, parsed.entityType, parsed.entityId))) {
      return notFound("Record");
    }

    const [created] = await db
      .insert(entityTag)
      .values({
        tagId: parsed.tagId,
        entityType: parsed.entityType,
        entityId: parsed.entityId,
      })
      .onConflictDoNothing()
      .returning();

    return NextResponse.json({ entityTag: created }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
