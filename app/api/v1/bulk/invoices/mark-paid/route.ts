import { db } from "@/lib/db";
import { invoice } from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { ok, handleError } from "@/lib/api/response";
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

    const invoices = await db.query.invoice.findMany({
      where: and(
        inArray(invoice.id, ids),
        eq(invoice.organizationId, ctx.organizationId)
      ),
    });

    let count = 0;
    for (const inv of invoices) {
      if (inv.status === "void") continue;
      await db
        .update(invoice)
        .set({
          status: "paid",
          amountPaid: inv.total,
          amountDue: 0,
          paidAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(invoice.id, inv.id));
      count++;
    }

    return ok({ updated: count });
  } catch (err) {
    return handleError(err);
  }
}
