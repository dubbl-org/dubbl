import { db } from "@/lib/db";
import { documentTemplate } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { notDeleted, softDelete } from "@/lib/db/soft-delete";
import { ok, notFound, handleError } from "@/lib/api/response";
import { logAudit, diffChanges } from "@/lib/api/audit";
import { z } from "zod";
import { clearOtherDefaults } from "@/lib/documents/templates";
import { HEX_COLOR_RE } from "@/lib/documents/template-text";

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
  accentColor: z.string().regex(HEX_COLOR_RE, "Accent color must be a hex colour like #10b981").optional(),
  showTaxBreakdown: z.boolean().optional(),
  showPaymentTerms: z.boolean().optional(),
  notes: z.string().nullable().optional(),
  bankDetails: z.string().nullable().optional(),
  paymentInstructions: z.string().nullable().optional(),
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

    const existing = await db.query.documentTemplate.findFirst({
      where: and(
        eq(documentTemplate.id, id),
        eq(documentTemplate.organizationId, ctx.organizationId),
        notDeleted(documentTemplate.deletedAt)
      ),
    });

    if (!existing) return notFound("Template");

    // Turning Default Template on switches off the previous default of this type.
    const updated = await db.transaction(async (tx) => {
      await clearOtherDefaults(tx, ctx.organizationId, { id, type: existing.type, isDefault: parsed.isDefault });
      const [row] = await tx
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
      return row;
    });

    if (!updated) return notFound("Template");

    logAudit({ ctx, action: "update", entityType: "document_template", entityId: id, changes: diffChanges(existing as Record<string, unknown>, updated as Record<string, unknown>), request });

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
      // Drop the default flag so restoring it from the trash can't leave two defaults.
      .set({ ...softDelete(), isDefault: false })
      .where(
        and(
          eq(documentTemplate.id, id),
          eq(documentTemplate.organizationId, ctx.organizationId)
        )
      )
      .returning();

    if (!deleted) return notFound("Template");

    logAudit({
      ctx,
      action: "delete",
      entityType: "document_template",
      entityId: id,
      changes: deleted as Record<string, unknown>,
      request,
    });

    return ok({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
