import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { taxRate, taxComponent } from "@/lib/db/schema";
import { eq, and, ne } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { logAudit, diffChanges } from "@/lib/api/audit";
import { notDeleted, softDelete } from "@/lib/db/soft-delete";
import { z } from "zod";

// A single component of a compound tax (e.g. GST + PST). rate is in basis
// points (1000 = 10.00%); accountId optionally directs the component to its own
// chart account.
const componentSchema = z.object({
  name: z.string().min(1),
  rate: z.number().int().min(0), // basis points: 1000 = 10%
  accountId: z.string().uuid().nullable().optional(),
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  rate: z.number().int().min(0).optional(),
  type: z.enum(["sales", "purchase", "both"]).optional(),
  // How the tax behaves for input-tax recovery / posting.
  kind: z
    .enum([
      "standard",
      "blocked",
      "partial_block",
      "exempt",
      "reverse_charge",
      "no_vat",
      "sales_tax_us",
    ])
    .optional(),
  // Share of input tax that is recoverable, in basis points (10000 = 100%).
  recoverablePercent: z.number().int().min(0).max(10000).optional(),
  // When provided, fully replaces the existing compound components.
  components: z.array(componentSchema).optional(),
  isDefault: z.boolean().optional(),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);

    const found = await db.query.taxRate.findFirst({
      where: and(
        eq(taxRate.id, id),
        eq(taxRate.organizationId, ctx.organizationId),
        notDeleted(taxRate.deletedAt)
      ),
      with: { components: true },
    });

    if (!found) return notFound("Tax rate");
    return NextResponse.json({ taxRate: found });
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:tax-rates");

    const body = await request.json();
    const { components, ...parsed } = updateSchema.parse(body);

    const existing = await db.query.taxRate.findFirst({
      where: and(
        eq(taxRate.id, id),
        eq(taxRate.organizationId, ctx.organizationId),
        notDeleted(taxRate.deletedAt)
      ),
    });

    if (!existing) return notFound("Tax rate");

    const updated = await db.transaction(async (tx) => {
      // An org can only have one default tax rate. If this one is being made the
      // default, clear the flag on every OTHER rate in the org first.
      if (parsed.isDefault) {
        await tx
          .update(taxRate)
          .set({ isDefault: false })
          .where(
            and(
              eq(taxRate.organizationId, ctx.organizationId),
              eq(taxRate.isDefault, true),
              ne(taxRate.id, id)
            )
          );
      }

      let row = existing;
      if (Object.keys(parsed).length > 0) {
        [row] = await tx
          .update(taxRate)
          .set(parsed)
          .where(eq(taxRate.id, id))
          .returning();
      }

      // When components are supplied, replace the full set for this rate.
      if (components) {
        await tx
          .delete(taxComponent)
          .where(eq(taxComponent.taxRateId, id));
        if (components.length > 0) {
          await tx.insert(taxComponent).values(
            components.map((c) => ({
              taxRateId: id,
              name: c.name,
              rate: c.rate,
              accountId: c.accountId ?? null,
            }))
          );
        }
      }

      return row;
    });

    logAudit({ ctx, action: "update", entityType: "tax_rate", entityId: id, changes: diffChanges(existing as Record<string, unknown>, updated as Record<string, unknown>), request });

    return NextResponse.json({ taxRate: updated });
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
    requireRole(ctx, "manage:tax-rates");

    const existing = await db.query.taxRate.findFirst({
      where: and(
        eq(taxRate.id, id),
        eq(taxRate.organizationId, ctx.organizationId),
        notDeleted(taxRate.deletedAt)
      ),
    });

    if (!existing) return notFound("Tax rate");

    await db
      .update(taxRate)
      .set(softDelete())
      .where(eq(taxRate.id, id));

    logAudit({
      ctx,
      action: "delete",
      entityType: "tax_rate",
      entityId: id,
      changes: existing as Record<string, unknown>,
      request,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
