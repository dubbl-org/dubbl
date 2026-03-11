import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { entityTag, tag } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError, notFound } from "@/lib/api/response";
import { z } from "zod";

const schema = z.object({
  tagId: z.string().uuid(),
  entityType: z.enum(["journal_entry", "invoice", "bill", "expense", "contact", "project"]),
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
    if (!t || t.organizationId !== ctx.organizationId) {
      return notFound("Tag");
    }

    await db
      .delete(entityTag)
      .where(
        and(
          eq(entityTag.tagId, parsed.tagId),
          eq(entityTag.entityType, parsed.entityType),
          eq(entityTag.entityId, parsed.entityId)
        )
      );

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
