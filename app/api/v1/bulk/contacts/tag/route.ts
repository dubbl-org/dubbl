import { db } from "@/lib/db";
import { contact } from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { ok, handleError } from "@/lib/api/response";
import { z } from "zod";

const schema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100),
  type: z.enum(["customer", "supplier", "both"]),
});

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:contacts");

    const body = await request.json();
    const { ids, type } = schema.parse(body);

    const updated = await db
      .update(contact)
      .set({ type, updatedAt: new Date() })
      .where(
        and(
          inArray(contact.id, ids),
          eq(contact.organizationId, ctx.organizationId)
        )
      )
      .returning({ id: contact.id });

    return ok({ updated: updated.length });
  } catch (err) {
    return handleError(err);
  }
}
