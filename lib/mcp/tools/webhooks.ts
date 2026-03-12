import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import crypto from "crypto";
import { db } from "@/lib/db";
import { webhook, webhookDelivery } from "@/lib/db/schema";
import { eq, and, isNull, desc, sql } from "drizzle-orm";
import { wrapTool } from "@/lib/mcp/errors";
import { softDelete } from "@/lib/db/soft-delete";
import { deliverWebhook } from "@/lib/webhooks/deliver";
import type { AuthContext } from "@/lib/api/auth-context";

export function registerWebhookTools(server: McpServer, ctx: AuthContext) {
  server.tool(
    "list_webhooks",
    "List webhooks for the current organization. Returns paginated results sorted by newest first.",
    {
      page: z
        .number()
        .int()
        .min(1)
        .optional()
        .default(1)
        .describe("Page number (default: 1)"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .default(50)
        .describe("Maximum number of webhooks to return (default: 50)"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const offset = (params.page - 1) * params.limit;

        const conditions = [
          eq(webhook.organizationId, ctx.organizationId),
          isNull(webhook.deletedAt),
        ];

        const results = await db.query.webhook.findMany({
          where: and(...conditions),
          orderBy: desc(webhook.createdAt),
          limit: params.limit,
          offset,
        });

        const [countResult] = await db
          .select({ count: sql<number>`count(*)`.mapWith(Number) })
          .from(webhook)
          .where(and(...conditions));

        return {
          webhooks: results,
          total: Number(countResult?.count || 0),
          page: params.page,
          limit: params.limit,
        };
      })
  );

  server.tool(
    "create_webhook",
    "Create a new webhook for the current organization. A signing secret is automatically generated. Returns the created webhook including the secret.",
    {
      url: z.string().url().describe("The URL to deliver webhook events to"),
      events: z
        .array(z.string())
        .min(1)
        .describe(
          "Array of event types to subscribe to (e.g. invoice.created, payment.received)"
        ),
      description: z
        .string()
        .optional()
        .describe("Optional human-readable description of this webhook"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const secret = crypto.randomBytes(32).toString("hex");

        const [created] = await db
          .insert(webhook)
          .values({
            organizationId: ctx.organizationId,
            url: params.url,
            events: params.events,
            secret,
            description: params.description || null,
          })
          .returning();

        return { webhook: created };
      })
  );

  server.tool(
    "update_webhook",
    "Update an existing webhook by ID. Only fields provided will be updated.",
    {
      webhookId: z.string().describe("The UUID of the webhook to update"),
      url: z.string().url().optional().describe("New URL for the webhook"),
      events: z
        .array(z.string())
        .min(1)
        .optional()
        .describe("New list of event types to subscribe to"),
      description: z
        .string()
        .nullable()
        .optional()
        .describe("New description (null to clear)"),
      isActive: z
        .boolean()
        .optional()
        .describe("Whether the webhook is active"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const existing = await db.query.webhook.findFirst({
          where: and(
            eq(webhook.id, params.webhookId),
            eq(webhook.organizationId, ctx.organizationId),
            isNull(webhook.deletedAt)
          ),
        });

        if (!existing) {
          throw new Error("Webhook not found");
        }

        const updates: Record<string, unknown> = {};
        if (params.url !== undefined) updates.url = params.url;
        if (params.events !== undefined) updates.events = params.events;
        if (params.description !== undefined)
          updates.description = params.description;
        if (params.isActive !== undefined) updates.isActive = params.isActive;

        const [updated] = await db
          .update(webhook)
          .set(updates)
          .where(eq(webhook.id, params.webhookId))
          .returning();

        return { webhook: updated };
      })
  );

  server.tool(
    "delete_webhook",
    "Soft-delete a webhook by ID. The webhook will no longer receive events.",
    {
      webhookId: z.string().describe("The UUID of the webhook to delete"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const existing = await db.query.webhook.findFirst({
          where: and(
            eq(webhook.id, params.webhookId),
            eq(webhook.organizationId, ctx.organizationId),
            isNull(webhook.deletedAt)
          ),
        });

        if (!existing) {
          throw new Error("Webhook not found");
        }

        await db
          .update(webhook)
          .set(softDelete())
          .where(eq(webhook.id, params.webhookId));

        return { success: true };
      })
  );

  server.tool(
    "list_webhook_deliveries",
    "List delivery attempts for a specific webhook. Returns paginated results sorted by newest first, including status, response code, and attempt count.",
    {
      webhookId: z
        .string()
        .describe("The UUID of the webhook to list deliveries for"),
      page: z
        .number()
        .int()
        .min(1)
        .optional()
        .default(1)
        .describe("Page number (default: 1)"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .default(50)
        .describe("Maximum number of deliveries to return (default: 50)"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        // Verify webhook belongs to org
        const existing = await db.query.webhook.findFirst({
          where: and(
            eq(webhook.id, params.webhookId),
            eq(webhook.organizationId, ctx.organizationId),
            isNull(webhook.deletedAt)
          ),
        });

        if (!existing) {
          throw new Error("Webhook not found");
        }

        const offset = (params.page - 1) * params.limit;

        const conditions = [eq(webhookDelivery.webhookId, params.webhookId)];

        const deliveries = await db.query.webhookDelivery.findMany({
          where: and(...conditions),
          orderBy: desc(webhookDelivery.createdAt),
          limit: params.limit,
          offset,
        });

        const [countResult] = await db
          .select({ count: sql<number>`count(*)`.mapWith(Number) })
          .from(webhookDelivery)
          .where(and(...conditions));

        return {
          deliveries,
          total: Number(countResult?.count || 0),
          page: params.page,
          limit: params.limit,
        };
      })
  );

  server.tool(
    "test_webhook",
    "Send a test delivery to a webhook. Creates a real delivery record with a sample payload so you can verify connectivity.",
    {
      webhookId: z
        .string()
        .describe("The UUID of the webhook to send a test event to"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const existing = await db.query.webhook.findFirst({
          where: and(
            eq(webhook.id, params.webhookId),
            eq(webhook.organizationId, ctx.organizationId),
            isNull(webhook.deletedAt)
          ),
        });

        if (!existing) {
          throw new Error("Webhook not found");
        }

        const testPayload = {
          event: "test",
          data: {
            message: "This is a test webhook delivery from dubbl",
            webhookId: existing.id,
            timestamp: new Date().toISOString(),
          },
        };

        const delivery = await deliverWebhook(existing.id, "test", testPayload);

        return { delivery };
      })
  );
}
