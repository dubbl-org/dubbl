import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db } from "@/lib/db";
import { stripeIntegration, stripeEntityMap, stripeSyncLog } from "@/lib/db/schema";
import { eq, and, desc, gte, sql } from "drizzle-orm";
import { requireRole } from "@/lib/api/require-role";
import { wrapTool } from "@/lib/mcp/errors";
import { notDeleted } from "@/lib/db/soft-delete";
import { runInitialSync } from "@/lib/integrations/stripe/initial-sync";
import { parseStripePaymentsCsv, parseStripePayoutsCsv } from "@/lib/integrations/stripe/csv-parser";
import { handleChargeSucceeded, handlePayoutPaid } from "@/lib/integrations/stripe/sync";
import { reconcileStripeBalance } from "@/lib/integrations/stripe/reconcile";
import type { AuthContext } from "@/lib/api/auth-context";
import type Stripe from "stripe";

async function findIntegration(ctx: AuthContext, integrationId: string) {
  const integration = await db.query.stripeIntegration.findFirst({
    where: and(
      eq(stripeIntegration.id, integrationId),
      eq(stripeIntegration.organizationId, ctx.organizationId),
      notDeleted(stripeIntegration.deletedAt)
    ),
  });
  if (!integration) throw new Error("Stripe integration not found");
  return integration;
}

export function registerIntegrationTools(server: McpServer, ctx: AuthContext) {
  server.tool(
    "list_stripe_integrations",
    "List all active Stripe integrations for the organization. Returns id, label, stripeAccountId, and status for each.",
    {},
    () =>
      wrapTool(ctx, async () => {
        const integrations = await db.query.stripeIntegration.findMany({
          where: and(
            eq(stripeIntegration.organizationId, ctx.organizationId),
            notDeleted(stripeIntegration.deletedAt)
          ),
        });

        return {
          integrations: integrations.map((i) => ({
            id: i.id,
            label: i.label,
            stripeAccountId: i.stripeAccountId,
            status: i.status,
            livemode: i.livemode,
            lastSyncAt: i.lastSyncAt,
            initialSyncCompleted: i.initialSyncCompleted,
          })),
        };
      })
  );

  server.tool(
    "get_stripe_integration_status",
    "Get the status of a specific Stripe Connect integration, or all integrations if no integrationId is provided. Returns connection status, account mappings, last sync time, and whether initial sync is completed.",
    {
      integrationId: z
        .string()
        .optional()
        .describe("UUID of the Stripe integration. If omitted, returns all integrations."),
    },
    (params) =>
      wrapTool(ctx, async () => {
        if (params.integrationId) {
          const integration = await findIntegration(ctx, params.integrationId);
          return {
            connected: true,
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
          };
        }

        const integrations = await db.query.stripeIntegration.findMany({
          where: and(
            eq(stripeIntegration.organizationId, ctx.organizationId),
            notDeleted(stripeIntegration.deletedAt)
          ),
        });

        if (integrations.length === 0) {
          return { connected: false };
        }

        return {
          connected: true,
          integrations: integrations.map((i) => ({
            id: i.id,
            label: i.label,
            status: i.status,
            stripeAccountId: i.stripeAccountId,
            livemode: i.livemode,
            lastSyncAt: i.lastSyncAt,
            initialSyncCompleted: i.initialSyncCompleted,
            initialSyncDays: i.initialSyncDays,
            errorMessage: i.errorMessage,
            clearingAccountId: i.clearingAccountId,
            revenueAccountId: i.revenueAccountId,
            feesAccountId: i.feesAccountId,
            payoutBankAccountId: i.payoutBankAccountId,
          })),
        };
      })
  );

  server.tool(
    "connect_stripe",
    "Generate a Stripe Connect OAuth URL to connect a Stripe account. Returns a URL that the user should open in their browser to authorize the connection.",
    {
      label: z
        .string()
        .describe("A label for this Stripe integration (e.g. 'Main Store', 'EU Account')"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:integrations");

        const clientId = process.env.STRIPE_CONNECT_CLIENT_ID;
        if (!clientId) {
          throw new Error("Stripe Connect not configured (missing STRIPE_CONNECT_CLIENT_ID)");
        }

        const stateParams = new URLSearchParams({
          response_type: "code",
          client_id: clientId,
          scope: "read_write",
          state: Buffer.from(
            JSON.stringify({
              orgId: ctx.organizationId,
              userId: ctx.userId,
              nonce: Date.now(),
              label: params.label,
            })
          ).toString("base64url"),
          redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/v1/integrations/stripe/callback`,
        });

        return {
          url: `https://connect.stripe.com/oauth/authorize?${stateParams.toString()}`,
          message: "Open this URL in a browser to connect your Stripe account.",
        };
      })
  );

  server.tool(
    "disconnect_stripe",
    "Disconnect a specific Stripe account. Requires integrationId and confirm: true to proceed. This stops syncing and deauthorizes access.",
    {
      integrationId: z
        .string()
        .describe("UUID of the Stripe integration to disconnect"),
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

        const integration = await findIntegration(ctx, params.integrationId);

        const { stripe } = await import("@/lib/stripe");
        if (!stripe) return "Stripe is not configured";

        try {
          await stripe.oauth.deauthorize({
            client_id: process.env.STRIPE_CONNECT_CLIENT_ID!,
            stripe_user_id: integration.stripeAccountId,
          });
        } catch {
          // Continue even if deauth fails
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
    "Trigger a manual sync of Stripe data for a specific integration. Syncs customers, charges, and payouts from the last N days. Returns immediately; sync runs in the background.",
    {
      integrationId: z
        .string()
        .describe("UUID of the Stripe integration to sync"),
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

        const integration = await findIntegration(ctx, params.integrationId);

        if (params.days !== integration.initialSyncDays) {
          await db
            .update(stripeIntegration)
            .set({ initialSyncDays: params.days, updatedAt: new Date() })
            .where(eq(stripeIntegration.id, integration.id));
        }

        runInitialSync(integration.id).catch((err) => {
          console.error("MCP triggered sync failed:", err);
        });

        return { success: true, message: `Sync started for last ${params.days} days` };
      })
  );

  server.tool(
    "list_stripe_sync_log",
    "List recent Stripe sync log entries for a specific integration. Returns event type, status (success/failed/skipped), error messages, and timestamps. Paginated with limit and offset.",
    {
      integrationId: z
        .string()
        .describe("UUID of the Stripe integration"),
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
        await findIntegration(ctx, params.integrationId);

        const logs = await db.query.stripeSyncLog.findMany({
          where: eq(stripeSyncLog.integrationId, params.integrationId),
          orderBy: desc(stripeSyncLog.createdAt),
          limit: params.limit,
          offset: params.offset,
        });

        return { logs, total: logs.length };
      })
  );

  server.tool(
    "import_stripe_csv",
    "Import a Stripe CSV export file for a specific integration. Accepts raw CSV text content and type ('payments' or 'payouts'). Skips already-imported transactions. Returns count of imported, skipped, and errored rows.",
    {
      integrationId: z
        .string()
        .describe("UUID of the Stripe integration"),
      csvContent: z
        .string()
        .describe("The raw CSV text content from a Stripe export file"),
      type: z
        .enum(["payments", "payouts"])
        .describe("Type of CSV: 'payments' for charge/payment data, 'payouts' for payout data"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:integrations");

        const integration = await findIntegration(ctx, params.integrationId);

        let imported = 0;
        let skipped = 0;
        const errors: string[] = [];

        if (params.type === "payments") {
          const rows = parseStripePaymentsCsv(params.csvContent);

          for (const row of rows) {
            const existing = await db.query.stripeEntityMap.findFirst({
              where: and(
                eq(stripeEntityMap.organizationId, ctx.organizationId),
                eq(stripeEntityMap.stripeEntityType, "charge"),
                eq(stripeEntityMap.stripeEntityId, row.id)
              ),
            });

            if (existing) { skipped++; continue; }

            try {
              const charge = {
                id: row.id,
                amount: row.amount,
                currency: row.currency.toLowerCase(),
                created: row.createdUtc
                  ? Math.floor(new Date(row.createdUtc).getTime() / 1000)
                  : Math.floor(Date.now() / 1000),
                balance_transaction: null,
                payment_intent: null,
                customer: null,
                billing_details: {
                  email: row.customerEmail,
                  name: row.customerName,
                  address: null,
                  phone: null,
                },
                refunds: { data: [] },
              } as unknown as Stripe.Charge;

              await handleChargeSucceeded(integration, charge);
              imported++;
            } catch (err) {
              errors.push(`${row.id}: ${err instanceof Error ? err.message : "Unknown error"}`);
            }
          }
        } else {
          const rows = parseStripePayoutsCsv(params.csvContent);

          for (const row of rows) {
            const existing = await db.query.stripeEntityMap.findFirst({
              where: and(
                eq(stripeEntityMap.organizationId, ctx.organizationId),
                eq(stripeEntityMap.stripeEntityType, "payout"),
                eq(stripeEntityMap.stripeEntityId, row.id)
              ),
            });

            if (existing) { skipped++; continue; }

            try {
              const payout = {
                id: row.id,
                amount: row.amount,
                currency: row.currency.toLowerCase(),
                arrival_date: row.arrivalDate
                  ? Math.floor(new Date(row.arrivalDate).getTime() / 1000)
                  : Math.floor(Date.now() / 1000),
              } as unknown as Stripe.Payout;

              await handlePayoutPaid(integration, payout);
              imported++;
            } catch (err) {
              errors.push(`${row.id}: ${err instanceof Error ? err.message : "Unknown error"}`);
            }
          }
        }

        return { imported, skipped, errors };
      })
  );

  server.tool(
    "reconcile_stripe_balance",
    "Compare Stripe balance transactions against local records to find missed events for a specific integration. Returns matched count and list of missing transactions with their Stripe IDs, types, and amounts in cents.",
    {
      integrationId: z
        .string()
        .describe("UUID of the Stripe integration to reconcile"),
      days: z
        .number()
        .int()
        .min(1)
        .max(90)
        .optional()
        .default(30)
        .describe("Number of days to reconcile (1-90, default 30)"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:integrations");

        await findIntegration(ctx, params.integrationId);

        const result = await reconcileStripeBalance(
          params.integrationId,
          ctx.organizationId,
          params.days
        );

        return result;
      })
  );

  server.tool(
    "list_stripe_entity_mappings",
    "List Stripe entity mappings for the organization. Shows how Stripe objects (charges, customers, invoices, etc.) map to local records. Useful for debugging sync state. Returns stripeEntityType, stripeEntityId, dubblEntityType, dubblEntityId, and metadata.",
    {
      stripeEntityType: z
        .string()
        .optional()
        .describe("Filter by Stripe entity type (e.g. 'charge', 'customer', 'payout', 'transfer', 'stripe_credit_note')"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(200)
        .optional()
        .default(50)
        .describe("Number of mappings to return (1-200, default 50)"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const conditions = [
          eq(stripeEntityMap.organizationId, ctx.organizationId),
        ];

        if (params.stripeEntityType) {
          conditions.push(eq(stripeEntityMap.stripeEntityType, params.stripeEntityType));
        }

        const mappings = await db.query.stripeEntityMap.findMany({
          where: and(...conditions),
          orderBy: desc(stripeEntityMap.createdAt),
          limit: params.limit,
        });

        return {
          mappings: mappings.map((m) => ({
            id: m.id,
            stripeEntityType: m.stripeEntityType,
            stripeEntityId: m.stripeEntityId,
            dubblEntityType: m.dubblEntityType,
            dubblEntityId: m.dubblEntityId,
            metadata: m.metadata,
            createdAt: m.createdAt,
          })),
          total: mappings.length,
        };
      })
  );

  server.tool(
    "get_stripe_webhook_health",
    "Get webhook health metrics for a Stripe integration. Returns event counts for the last 24 hours, broken down by status.",
    {
      integrationId: z
        .string()
        .optional()
        .describe("UUID of a specific Stripe integration. If omitted, returns health for all integrations."),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

        const conditions = [
          gte(stripeSyncLog.createdAt, twentyFourHoursAgo),
        ];

        if (params.integrationId) {
          await findIntegration(ctx, params.integrationId);
          conditions.push(eq(stripeSyncLog.integrationId, params.integrationId));
        } else {
          // Get all integration IDs for this org
          const integrations = await db.query.stripeIntegration.findMany({
            where: and(
              eq(stripeIntegration.organizationId, ctx.organizationId),
              notDeleted(stripeIntegration.deletedAt)
            ),
            columns: { id: true },
          });
          if (integrations.length === 0) {
            return { totalEvents: 0, success: 0, failed: 0, skipped: 0, exhausted: 0, lastEventAt: null };
          }
          conditions.push(
            sql`${stripeSyncLog.integrationId} IN (${sql.join(
              integrations.map((i) => sql`${i.id}`),
              sql`, `
            )})`
          );
        }

        const [stats] = await db
          .select({
            total: sql<number>`count(*)`.mapWith(Number),
            success: sql<number>`count(*) filter (where ${stripeSyncLog.status} = 'success')`.mapWith(Number),
            failed: sql<number>`count(*) filter (where ${stripeSyncLog.status} = 'failed')`.mapWith(Number),
            skipped: sql<number>`count(*) filter (where ${stripeSyncLog.status} = 'skipped')`.mapWith(Number),
            exhausted: sql<number>`count(*) filter (where ${stripeSyncLog.status} = 'failed' and ${stripeSyncLog.retryCount} >= 3)`.mapWith(Number),
            lastEventAt: sql<Date | null>`max(${stripeSyncLog.createdAt})`,
          })
          .from(stripeSyncLog)
          .where(and(...conditions));

        return {
          totalEvents: stats?.total ?? 0,
          success: stats?.success ?? 0,
          failed: stats?.failed ?? 0,
          skipped: stats?.skipped ?? 0,
          exhausted: stats?.exhausted ?? 0,
          lastEventAt: stats?.lastEventAt ?? null,
        };
      })
  );
}
