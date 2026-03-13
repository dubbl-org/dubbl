import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db } from "@/lib/db";
import { stripeIntegration, stripeSyncLog } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { requireRole } from "@/lib/api/require-role";
import { wrapTool } from "@/lib/mcp/errors";
import { notDeleted } from "@/lib/db/soft-delete";
import { runInitialSync } from "@/lib/integrations/stripe/initial-sync";
import type { AuthContext } from "@/lib/api/auth-context";

export function registerIntegrationTools(server: McpServer, ctx: AuthContext) {
  server.tool(
    "get_stripe_integration_status",
    "Get the current Stripe Connect integration status. Returns connection status, account mappings (clearing, revenue, fees, payout bank account), last sync time, and whether initial sync is completed.",
    {},
    () =>
      wrapTool(ctx, async () => {
        const integration = await db.query.stripeIntegration.findFirst({
          where: and(
            eq(stripeIntegration.organizationId, ctx.organizationId),
            notDeleted(stripeIntegration.deletedAt)
          ),
        });

        if (!integration) {
          return { connected: false };
        }

        return {
          connected: true,
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

  server.tool(
    "connect_stripe",
    "Generate a Stripe Connect OAuth URL to connect a Stripe account. Returns a URL that the user should open in their browser to authorize the connection.",
    {},
    () =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:integrations");

        const clientId = process.env.STRIPE_CONNECT_CLIENT_ID;
        if (!clientId) {
          throw new Error("Stripe Connect not configured (missing STRIPE_CONNECT_CLIENT_ID)");
        }

        const existing = await db.query.stripeIntegration.findFirst({
          where: and(
            eq(stripeIntegration.organizationId, ctx.organizationId),
            notDeleted(stripeIntegration.deletedAt)
          ),
        });
        if (existing) {
          throw new Error("A Stripe account is already connected. Disconnect first.");
        }

        const params = new URLSearchParams({
          response_type: "code",
          client_id: clientId,
          scope: "read_write",
          state: Buffer.from(
            JSON.stringify({ orgId: ctx.organizationId, userId: ctx.userId, nonce: Date.now() })
          ).toString("base64url"),
          redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/v1/integrations/stripe/callback`,
        });

        return {
          url: `https://connect.stripe.com/oauth/authorize?${params.toString()}`,
          message: "Open this URL in a browser to connect your Stripe account.",
        };
      })
  );

  server.tool(
    "disconnect_stripe",
    "Disconnect the connected Stripe account. Requires confirm: true to proceed. This stops syncing and deauthorizes access.",
    {
      confirm: z
        .boolean()
        .describe("Must be true to confirm disconnection"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:integrations");

        if (!params.confirm) {
          throw new Error("Set confirm to true to disconnect the Stripe account");
        }

        const integration = await db.query.stripeIntegration.findFirst({
          where: and(
            eq(stripeIntegration.organizationId, ctx.organizationId),
            notDeleted(stripeIntegration.deletedAt)
          ),
        });

        if (!integration) throw new Error("No Stripe integration found");

        const { stripe } = await import("@/lib/stripe");

        try {
          await stripe.oauth.deauthorize({
            client_id: process.env.STRIPE_CONNECT_CLIENT_ID!,
            stripe_user_id: integration.stripeAccountId,
          });
        } catch {
          // Continue even if deauth fails
        }

        if (integration.webhookEndpointId) {
          try {
            await stripe.webhookEndpoints.del(integration.webhookEndpointId, {
              stripeAccount: integration.stripeAccountId,
            });
          } catch {
            // Continue even if webhook deletion fails
          }
        }

        await db
          .update(stripeIntegration)
          .set({
            status: "disconnected",
            deletedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(stripeIntegration.id, integration.id));

        return { success: true, message: "Stripe account disconnected" };
      })
  );

  server.tool(
    "trigger_stripe_sync",
    "Trigger a manual sync of Stripe data. Syncs customers, charges, and payouts from the last N days. Returns immediately; sync runs in the background.",
    {
      days: z
        .number()
        .int()
        .min(1)
        .max(90)
        .optional()
        .default(30)
        .describe("Number of days to sync (1-90, default 30)"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:integrations");

        const integration = await db.query.stripeIntegration.findFirst({
          where: and(
            eq(stripeIntegration.organizationId, ctx.organizationId),
            notDeleted(stripeIntegration.deletedAt)
          ),
        });

        if (!integration) throw new Error("No Stripe integration found");

        // Update sync days if provided
        if (params.days !== integration.initialSyncDays) {
          await db
            .update(stripeIntegration)
            .set({ initialSyncDays: params.days, updatedAt: new Date() })
            .where(eq(stripeIntegration.id, integration.id));
        }

        // Fire-and-forget
        runInitialSync(integration.id).catch((err) => {
          console.error("MCP triggered sync failed:", err);
        });

        return { success: true, message: `Sync started for last ${params.days} days` };
      })
  );

  server.tool(
    "list_stripe_sync_log",
    "List recent Stripe sync log entries. Returns event type, status (success/failed/skipped), error messages, and timestamps. Paginated with limit and offset.",
    {
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .default(20)
        .describe("Number of entries to return (1-100, default 20)"),
      offset: z
        .number()
        .int()
        .min(0)
        .optional()
        .default(0)
        .describe("Number of entries to skip (default 0)"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const integration = await db.query.stripeIntegration.findFirst({
          where: and(
            eq(stripeIntegration.organizationId, ctx.organizationId),
            notDeleted(stripeIntegration.deletedAt)
          ),
        });

        if (!integration) throw new Error("No Stripe integration found");

        const logs = await db.query.stripeSyncLog.findMany({
          where: eq(stripeSyncLog.integrationId, integration.id),
          orderBy: desc(stripeSyncLog.createdAt),
          limit: params.limit,
          offset: params.offset,
        });

        return { logs, total: logs.length };
      })
  );
}
