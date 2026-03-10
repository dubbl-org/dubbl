import { db } from "@/lib/db";
import { savedReport } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { notDeleted, softDelete } from "@/lib/db/soft-delete";
import { ok, notFound, handleError } from "@/lib/api/response";
import { z } from "zod";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);

    const report = await db.query.savedReport.findFirst({
      where: and(
        eq(savedReport.id, id),
        eq(savedReport.organizationId, ctx.organizationId),
        notDeleted(savedReport.deletedAt)
      ),
    });

    if (!report) return notFound("Report");
    return ok({ report });
  } catch (err) {
    return handleError(err);
  }
}

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  config: z.object({
    dataSource: z.enum(["invoices", "expenses", "transactions", "payroll", "inventory", "contacts"]),
    filters: z.array(z.object({ field: z.string(), operator: z.string(), value: z.string() })),
    groupBy: z.array(z.string()),
    columns: z.array(z.string()),
    dateRange: z.object({ from: z.string(), to: z.string() }).optional(),
    chartType: z.enum(["table", "bar", "line", "pie"]).optional(),
  }).optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    const body = await request.json();
    const parsed = updateSchema.parse(body);

    const [updated] = await db
      .update(savedReport)
      .set({ ...parsed, updatedAt: new Date() })
      .where(
        and(
          eq(savedReport.id, id),
          eq(savedReport.organizationId, ctx.organizationId),
          notDeleted(savedReport.deletedAt)
        )
      )
      .returning();

    if (!updated) return notFound("Report");
    return ok({ report: updated });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);

    const [deleted] = await db
      .update(savedReport)
      .set(softDelete())
      .where(
        and(
          eq(savedReport.id, id),
          eq(savedReport.organizationId, ctx.organizationId)
        )
      )
      .returning();

    if (!deleted) return notFound("Report");
    return ok({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
