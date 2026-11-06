import { db } from "@/lib/db";
import { contact, deal } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { CRM_PERMISSION, assertOrgUser, CrmError } from "@/lib/api/crm-deals";
import { notDeleted, softDelete } from "@/lib/db/soft-delete";
import { ok, notFound, handleError } from "@/lib/api/response";
import { logAudit, diffChanges } from "@/lib/api/audit";
import { z } from "zod";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);

    const d = await db.query.deal.findFirst({
      where: and(
        eq(deal.id, id),
        eq(deal.organizationId, ctx.organizationId),
        notDeleted(deal.deletedAt)
      ),
      with: {
        contact: true,
        assignedUser: { columns: { id: true, name: true, email: true, image: true } },
        // Newest first, with who logged each one.
        activities: {
          with: { user: { columns: { id: true, name: true, email: true, image: true } } },
          orderBy: (a, { desc }) => [desc(a.createdAt)],
        },
        pipeline: true,
      },
    });

    if (!d) return notFound("Deal");
    return ok({ deal: d });
  } catch (err) {
    return handleError(err);
  }
}

const updateSchema = z.object({
  title: z.string().min(1).optional(),
  valueCents: z.number().int().min(0).optional(),
  // null clears it (an empty Probability field).
  probability: z.number().int().min(0).max(100).nullable().optional(),
  expectedCloseDate: z.string().nullable().optional(),
  assignedTo: z.guid().nullable().optional(),
  notes: z.string().nullable().optional(),
  contactId: z.guid().nullable().optional(),
  source: z.enum(["website", "referral", "cold_outreach", "event", "other"]).nullable().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, CRM_PERMISSION);
    const body = await request.json();
    const parsed = updateSchema.parse(body);

    await assertOrgUser(ctx, parsed.assignedTo);
    if (parsed.contactId) {
      const c = await db.query.contact.findFirst({
        where: and(eq(contact.id, parsed.contactId), eq(contact.organizationId, ctx.organizationId)),
        columns: { id: true },
      });
      if (!c) throw new CrmError("Contact not found", 404);
    }

    const existing = await db.query.deal.findFirst({
      where: and(eq(deal.id, id), eq(deal.organizationId, ctx.organizationId), notDeleted(deal.deletedAt)),
    });
    if (!existing) return notFound("Deal");

    const [updated] = await db
      .update(deal)
      .set({ ...parsed, updatedAt: new Date() })
      .where(and(eq(deal.id, id), eq(deal.organizationId, ctx.organizationId)))
      .returning();

    if (!updated) return notFound("Deal");

    logAudit({ ctx, action: "update", entityType: "deal", entityId: id, changes: diffChanges(existing as Record<string, unknown>, updated as Record<string, unknown>), request });

    return ok({ deal: updated });
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
    requireRole(ctx, CRM_PERMISSION);

    // Soft delete: the deal and its activities can be restored from Settings > Trash.
    const [deleted] = await db
      .update(deal)
      .set(softDelete())
      .where(and(eq(deal.id, id), eq(deal.organizationId, ctx.organizationId), notDeleted(deal.deletedAt)))
      .returning();

    if (!deleted) return notFound("Deal");

    logAudit({
      ctx,
      action: "delete",
      entityType: "deal",
      entityId: id,
      changes: deleted as Record<string, unknown>,
      request,
    });

    return ok({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
