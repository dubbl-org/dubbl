import { db } from "@/lib/db";
import { documentFolder } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { notDeleted } from "@/lib/db/soft-delete";
import { ok, created, handleError } from "@/lib/api/response";
import { z } from "zod";

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);

    const folders = await db.query.documentFolder.findMany({
      where: and(
        eq(documentFolder.organizationId, ctx.organizationId),
        notDeleted(documentFolder.deletedAt)
      ),
      orderBy: documentFolder.name,
    });

    return ok({ folders });
  } catch (err) {
    return handleError(err);
  }
}

const createSchema = z.object({
  name: z.string().min(1),
  parentId: z.string().uuid().nullable().optional(),
});

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const body = await request.json();
    const parsed = createSchema.parse(body);

    const [folder] = await db
      .insert(documentFolder)
      .values({
        organizationId: ctx.organizationId,
        name: parsed.name,
        parentId: parsed.parentId || null,
      })
      .returning();

    return created({ folder });
  } catch (err) {
    return handleError(err);
  }
}
