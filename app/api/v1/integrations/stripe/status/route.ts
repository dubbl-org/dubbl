import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { stripeIntegration, stripeSyncLog } from "@/lib/db/schema";
import { stripe } from "@/lib/stripe";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError } from "@/lib/api/response";
import { eq, and, desc } from "drizzle-orm";
import { notDeleted } from "@/lib/db/soft-delete";

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);

    const url = new URL(request.url);
    const integrationId = url.searchParams.get("integrationId");

    if (integrationId) {
      // Return a single integration
      const integration = await db.query.stripeIntegration.findFirst({
        where: and(
          eq(stripeIntegration.id, integrationId),
          eq(stripeIntegration.organizationId, ctx.organizationId),
          notDeleted(stripeIntegration.deletedAt)
        ),
      });

      if (!integration) {
        return NextResponse.json({ connected: false });
      }

      let healthy = true;
      let healthError: string | null = null;
      try {
        await stripe.accounts.retrieve(integration.stripeAccountId);
      } catch (err) {
        healthy = false;
        healthError = err instanceof Error ? err.message : "Unable to reach Stripe account";
      }

      const logs = await db.query.stripeSyncLog.findMany({
        where: eq(stripeSyncLog.integrationId, integration.id),
        orderBy: desc(stripeSyncLog.createdAt),
        limit: 20,
      });

      return NextResponse.json({
        connected: true,
        healthy,
        healthError,
        id: integration.id,
        label: integration.label,
        status: integration.status,
        stripeAccountId: integration.stripeAccountId,
        livemode: integration.livemode,
        lastSyncAt: integration.lastSyncAt,
        initialSyncCompleted: integration.initialSyncCompleted,
        initialSyncDays: integration.initialSyncDays,
        errorMessage: integration.errorMessage,
        clearingAccountId: integration.clearingAccountId,
        revenueAccountId: integration.revenueAccountId,
        feesAccountId: integration.feesAccountId,
        payoutBankAccountId: integration.payoutBankAccountId,
        syncLogs: logs,
      });
    }

    // Return all integrations for the org
    const integrations = await db.query.stripeIntegration.findMany({
      where: and(
        eq(stripeIntegration.organizationId, ctx.organizationId),
        notDeleted(stripeIntegration.deletedAt)
      ),
    });

    if (integrations.length === 0) {
      return NextResponse.json({ connected: false, integrations: [] });
    }

    const results = await Promise.all(
      integrations.map(async (integration) => {
        let healthy = true;
        let healthError: string | null = null;
        try {
          await stripe.accounts.retrieve(integration.stripeAccountId);
        } catch (err) {
          healthy = false;
          healthError = err instanceof Error ? err.message : "Unable to reach Stripe account";
        }

        return {
          id: integration.id,
          label: integration.label,
          connected: true,
          healthy,
          healthError,
          status: integration.status,
          stripeAccountId: integration.stripeAccountId,
          livemode: integration.livemode,
          lastSyncAt: integration.lastSyncAt,
          initialSyncCompleted: integration.initialSyncCompleted,
          initialSyncDays: integration.initialSyncDays,
          errorMessage: integration.errorMessage,
          clearingAccountId: integration.clearingAccountId,
          revenueAccountId: integration.revenueAccountId,
          feesAccountId: integration.feesAccountId,
          payoutBankAccountId: integration.payoutBankAccountId,
        };
      })
    );

    return NextResponse.json({ connected: true, integrations: results });
  } catch (err) {
    return handleError(err);
  }
}
