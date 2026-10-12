import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db } from "@/lib/db";
import { notification, notificationPreference, notificationTypeEnum } from "@/lib/db/schema";
import { eq, and, isNull, desc, notInArray } from "drizzle-orm";
import { softDelete } from "@/lib/db/soft-delete";
import { wrapTool } from "@/lib/mcp/errors";
import type { AuthContext } from "@/lib/api/auth-context";

export function registerNotificationTools(server: McpServer, ctx: AuthContext) {
  server.tool(
    "list_notifications",
    "List notifications for the authenticated user in this organization, newest first (default 50, max 100). Removed notifications and types the user muted for the in-app channel are left out. Optionally filter to only unread notifications. Returns { notifications, total } where each notification has id, type, title, body, entityType, entityId, readAt (null when unread) and createdAt.",
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

        const muted = await db.query.notificationPreference.findMany({
          where: and(
            eq(notificationPreference.organizationId, ctx.organizationId),
            eq(notificationPreference.userId, ctx.userId),
            eq(notificationPreference.channel, "in_app"),
            eq(notificationPreference.enabled, false)
          ),
          columns: { type: true },
        });
        if (muted.length > 0) {
          conditions.push(notInArray(notification.type, muted.map((m) => m.type)));
        }

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
    "mark_notification_unread",
    "Mark a specific notification as unread again by clearing its readAt timestamp. The notification must belong to the authenticated user. Returns the updated notification.",
    {
      notificationId: z
        .string()
        .describe("The UUID of the notification to mark as unread"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const [updated] = await db
          .update(notification)
          .set({ readAt: null })
          .where(
            and(
              eq(notification.id, params.notificationId),
              eq(notification.organizationId, ctx.organizationId),
              eq(notification.userId, ctx.userId),
              isNull(notification.deletedAt)
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
    "mark_all_notifications_read",
    "Mark every unread notification of the authenticated user in this organization as read. Takes no input. Returns { updated } with the number of notifications that changed.",
    {},
    () =>
      wrapTool(ctx, async () => {
        const updated = await db
          .update(notification)
          .set({ readAt: new Date() })
          .where(
            and(
              eq(notification.organizationId, ctx.organizationId),
              eq(notification.userId, ctx.userId),
              isNull(notification.readAt),
              isNull(notification.deletedAt)
            )
          )
          .returning({ id: notification.id });

        return { updated: updated.length };
      })
  );

  server.tool(
    "delete_notification",
    "Remove a notification from the authenticated user's inbox (soft delete; it no longer appears in lists). The notification must belong to the authenticated user. Returns { success: true }.",
    {
      notificationId: z
        .string()
        .describe("The UUID of the notification to remove"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const [deleted] = await db
          .update(notification)
          .set(softDelete())
          .where(
            and(
              eq(notification.id, params.notificationId),
              eq(notification.organizationId, ctx.organizationId),
              eq(notification.userId, ctx.userId),
              isNull(notification.deletedAt)
            )
          )
          .returning({ id: notification.id });

        if (!deleted) {
          throw new Error("Notification not found");
        }

        return { success: true };
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
    "Update the authenticated user's notification preferences. Each preference specifies a notification type, channel (in_app or email), whether it's enabled (turning in_app off hides that type from the inbox), and optionally the digest interval in minutes (0 = immediate, 15/30/60 = batched). Returns updated preferences.",
    {
      preferences: z
        .array(
          z.object({
            type: z
              .enum(notificationTypeEnum.enumValues)
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
