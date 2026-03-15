import { db } from "@/lib/db";
import { invoice } from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { ok, handleError } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { z } from "zod";

const schema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100),
});

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:invoices");

    const body = await request.json();
    const { ids } = schema.parse(body);

    const updated = await db
      .update(invoice)
      .set({ status: "sent", sentAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          inArray(invoice.id, ids),
          eq(invoice.organizationId, ctx.organizationId),
          eq(invoice.status, "draft")
        )
      )
      .returning({ id: invoice.id });

    await logAudit({ ctx, action: "send", entityType: "invoice", entityId: ctx.organizationId,
      changes: { count: updated.length, ids: updated.map((r) => r.id) }, request });

    return ok({ updated: updated.length, ids: updated.map((r) => r.id) });
  } catch (err) {
    return handleError(err);
  }
}
