import { db } from "@/lib/db";
import {
  notificationDigestQueue,
  notificationPreference,
  notification,
  users,
  organization,
} from "@/lib/db/schema";
import { eq, and, isNull, lte, sql } from "drizzle-orm";
import { render } from "@react-email/render";
import { createElement } from "react";
import { sendPlatformEmail } from "@/lib/email/resend-client";
import { NotificationDigestEmail } from "@/lib/email/templates/notification-digest";

/**
 * Process notification digest queue.
 * Groups unprocessed entries by user, checks if their digest interval has elapsed,
 * then sends a batched email and marks entries as processed.
 */
export async function processDigests() {
  let sent = 0;
  let failed = 0;

  // Get distinct user+org combos with unprocessed entries
  const pendingUsers = await db
    .selectDistinct({
      userId: notificationDigestQueue.userId,
      organizationId: notificationDigestQueue.organizationId,
    })
    .from(notificationDigestQueue)
    .where(isNull(notificationDigestQueue.processedAt));

  for (const { userId, organizationId } of pendingUsers) {
    try {
      // Get the user's digest interval (use first email pref found, default 30 min)
      const pref = await db.query.notificationPreference.findFirst({
        where: and(
          eq(notificationPreference.organizationId, organizationId),
          eq(notificationPreference.userId, userId),
          eq(notificationPreference.channel, "email")
        ),
      });

      const intervalMinutes = pref?.digestIntervalMinutes ?? 30;
      const cutoff = new Date(Date.now() - intervalMinutes * 60 * 1000);

      // Get unprocessed queue entries older than the interval
      const entries = await db
        .select({
          queueId: notificationDigestQueue.id,
          notificationId: notificationDigestQueue.notificationId,
          queueCreatedAt: notificationDigestQueue.createdAt,
        })
        .from(notificationDigestQueue)
        .where(
          and(
            eq(notificationDigestQueue.userId, userId),
            eq(notificationDigestQueue.organizationId, organizationId),
            isNull(notificationDigestQueue.processedAt),
            lte(notificationDigestQueue.createdAt, cutoff)
          )
        );

      if (entries.length === 0) continue;

      // Fetch the actual notifications
      const notificationIds = entries.map((e) => e.notificationId);
      const notifications = await db.query.notification.findMany({
        where: sql`${notification.id} = ANY(${notificationIds})`,
      });

      if (notifications.length === 0) continue;

      // Fetch user and org info
      const user = await db.query.users.findFirst({
        where: eq(users.id, userId),
      });
      const org = await db.query.organization.findFirst({
        where: eq(organization.id, organizationId),
      });

      if (!user?.email) continue;

      // Format timestamps
      const formatTime = (date: Date) => {
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMin = Math.floor(diffMs / 60000);
        if (diffMin < 60) return `${diffMin}m ago`;
        const diffHrs = Math.floor(diffMin / 60);
        if (diffHrs < 24) return `${diffHrs}h ago`;
        return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      };

      const element = createElement(NotificationDigestEmail, {
        userName: user.name || "there",
        orgName: org?.name || "dubbl",
        notifications: notifications.map((n) => ({
          type: n.type,
          title: n.title,
          body: n.body,
          createdAt: formatTime(n.createdAt),
        })),
        dashboardUrl: `${process.env.NEXT_PUBLIC_APP_URL || "https://app.dubbl.dev"}/notifications`,
      });

      const html = await render(element);

      await sendPlatformEmail({
        to: user.email,
        subject: `You have ${notifications.length} new notification${notifications.length !== 1 ? "s" : ""} on dubbl`,
        html,
      });

      // Mark entries as processed
      const queueIds = entries.map((e) => e.queueId);
      await db
        .update(notificationDigestQueue)
        .set({ processedAt: new Date() })
        .where(sql`${notificationDigestQueue.id} = ANY(${queueIds})`);

      sent++;
    } catch (err) {
      console.error(`Failed to process digest for user ${userId}:`, err);
      failed++;
    }
  }

  return { sent, failed };
}
