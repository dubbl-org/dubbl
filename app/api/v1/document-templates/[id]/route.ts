import { db } from "@/lib/db";
import { documentTemplate } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
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

    const template = await db.query.documentTemplate.findFirst({
      where: and(
        eq(documentTemplate.id, id),
        eq(documentTemplate.organizationId, ctx.organizationId),
        notDeleted(documentTemplate.deletedAt)
      ),
    });

    if (!template) return notFound("Template");
    return ok({ template });
  } catch (err) {
    return handleError(err);
  }
}

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  headerHtml: z.string().nullable().optional(),
  footerHtml: z.string().nullable().optional(),
  logoUrl: z.string().nullable().optional(),
  accentColor: z.string().optional(),
  showTaxBreakdown: z.boolean().optional(),
  showPaymentTerms: z.boolean().optional(),
  notes: z.string().nullable().optional(),
  isDefault: z.boolean().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:invoices");

    const body = await request.json();
    const parsed = updateSchema.parse(body);

    const [updated] = await db
      .update(documentTemplate)
      .set({ ...parsed, updatedAt: new Date() })
      .where(
        and(
          eq(documentTemplate.id, id),
          eq(documentTemplate.organizationId, ctx.organizationId),
          notDeleted(documentTemplate.deletedAt)
        )
      )
      .returning();

    if (!updated) return notFound("Template");
    return ok({ template: updated });
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
    requireRole(ctx, "manage:invoices");

    const [deleted] = await db
      .update(documentTemplate)
      .set(softDelete())
      .where(
        and(
          eq(documentTemplate.id, id),
          eq(documentTemplate.organizationId, ctx.organizationId)
        )
      )
      .returning();

    if (!deleted) return notFound("Template");
    return ok({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
