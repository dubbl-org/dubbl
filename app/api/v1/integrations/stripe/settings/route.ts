import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { stripeIntegration } from "@/lib/db/schema";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { eq, and } from "drizzle-orm";
import { notDeleted } from "@/lib/db/soft-delete";

const updateSchema = z.object({
  integrationId: z.string().uuid(),
  clearingAccountId: z.string().uuid().optional(),
  revenueAccountId: z.string().uuid().optional(),
  feesAccountId: z.string().uuid().optional(),
  payoutBankAccountId: z.string().uuid().optional(),
  initialSyncDays: z.number().int().min(1).max(365).optional(),
});

export async function PATCH(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:integrations");

    const body = updateSchema.parse(await request.json());

    const integration = await db.query.stripeIntegration.findFirst({
      where: and(
        eq(stripeIntegration.id, body.integrationId),
        eq(stripeIntegration.organizationId, ctx.organizationId),
        notDeleted(stripeIntegration.deletedAt)
      ),
    });

    if (!integration) return notFound("Stripe integration");

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (body.clearingAccountId !== undefined) updates.clearingAccountId = body.clearingAccountId;
    if (body.revenueAccountId !== undefined) updates.revenueAccountId = body.revenueAccountId;
    if (body.feesAccountId !== undefined) updates.feesAccountId = body.feesAccountId;
    if (body.payoutBankAccountId !== undefined) updates.payoutBankAccountId = body.payoutBankAccountId;
    if (body.initialSyncDays !== undefined) updates.initialSyncDays = body.initialSyncDays;

    const [updated] = await db
      .update(stripeIntegration)
      .set(updates)
      .where(eq(stripeIntegration.id, integration.id))
      .returning();

    return NextResponse.json(updated);
  } catch (err) {
    return handleError(err);
  }
}
