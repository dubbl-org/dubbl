import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db } from "@/lib/db";
import { notification, notificationPreference } from "@/lib/db/schema";
import { eq, and, isNull, desc } from "drizzle-orm";
import { wrapTool } from "@/lib/mcp/errors";
import type { AuthContext } from "@/lib/api/auth-context";

export function registerNotificationTools(server: McpServer, ctx: AuthContext) {
  server.tool(
    "list_notifications",
    "List notifications for the authenticated user in this organization. Returns up to 50 notifications sorted by newest first. Optionally filter to only unread notifications.",
    {
      unreadOnly: z
        .boolean()
        .optional()
        .default(false)
        .describe("Only return unread notifications"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .default(50)
        .describe("Maximum number of notifications to return (default: 50)"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const conditions = [
          eq(notification.organizationId, ctx.organizationId),
          eq(notification.userId, ctx.userId),
          isNull(notification.deletedAt),
        ];

        if (params.unreadOnly) {
          conditions.push(isNull(notification.readAt));
        }

        const results = await db.query.notification.findMany({
          where: and(...conditions),
          orderBy: desc(notification.createdAt),
          limit: params.limit,
        });

        return { notifications: results, total: results.length };
      })
  );

  server.tool(
    "mark_notification_read",
    "Mark a specific notification as read by setting its readAt timestamp. The notification must belong to the authenticated user.",
    {
      notificationId: z
        .string()
        .describe("The UUID of the notification to mark as read"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const [updated] = await db
          .update(notification)
          .set({ readAt: new Date() })
          .where(
            and(
              eq(notification.id, params.notificationId),
              eq(notification.organizationId, ctx.organizationId),
              eq(notification.userId, ctx.userId)
            )
          )
          .returning();

        if (!updated) {
          throw new Error("Notification not found");
        }

        return { notification: updated };
      })
  );

  server.tool(
    "get_notification_preferences",
    "Get the authenticated user's notification preferences for this organization. Returns an array of preference objects with type, channel (in_app/email), enabled status, and digest interval for email channel.",
    {},
    () =>
      wrapTool(ctx, async () => {
        const prefs = await db.query.notificationPreference.findMany({
          where: and(
            eq(notificationPreference.organizationId, ctx.organizationId),
            eq(notificationPreference.userId, ctx.userId)
          ),
        });

        return { preferences: prefs };
      })
  );

  server.tool(
    "update_notification_preferences",
    "Update the authenticated user's notification preferences. Each preference specifies a notification type, channel (in_app or email), whether it's enabled, and optionally the digest interval in minutes (0 = immediate, 15/30/60 = batched). Returns updated preferences.",
    {
      preferences: z
        .array(
          z.object({
            type: z
              .enum([
                "invoice_overdue",
                "payment_received",
                "inventory_low",
                "payroll_due",
                "approval_needed",
                "system_alert",
                "task_assigned",
              ])
              .describe("The notification type"),
            channel: z
              .enum(["in_app", "email"])
              .describe("The notification channel"),
            enabled: z
              .boolean()
              .describe("Whether this notification type+channel is enabled"),
            digestIntervalMinutes: z
              .number()
              .int()
              .min(0)
              .optional()
              .describe(
                "For email channel: digest interval in minutes. 0 = immediate, 15/30/60 = batched. Default 30."
              ),
          })
        )
        .describe("Array of preference updates"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        for (const pref of params.preferences) {
          const existing =
            await db.query.notificationPreference.findFirst({
              where: and(
                eq(
                  notificationPreference.organizationId,
                  ctx.organizationId
                ),
                eq(notificationPreference.userId, ctx.userId),
                eq(notificationPreference.type, pref.type),
                eq(notificationPreference.channel, pref.channel)
              ),
            });

          if (existing) {
            await db
              .update(notificationPreference)
              .set({
                enabled: pref.enabled,
                ...(pref.digestIntervalMinutes !== undefined && {
                  digestIntervalMinutes: pref.digestIntervalMinutes,
                }),
              })
              .where(eq(notificationPreference.id, existing.id));
          } else {
            await db.insert(notificationPreference).values({
              organizationId: ctx.organizationId,
              userId: ctx.userId,
              type: pref.type,
              channel: pref.channel,
              enabled: pref.enabled,
              digestIntervalMinutes: pref.digestIntervalMinutes ?? 30,
            });
          }
        }

        const prefs = await db.query.notificationPreference.findMany({
          where: and(
            eq(notificationPreference.organizationId, ctx.organizationId),
            eq(notificationPreference.userId, ctx.userId)
          ),
        });

        return { preferences: prefs };
      })
  );
}
