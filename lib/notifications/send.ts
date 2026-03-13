import { db } from "@/lib/db";
import { notification, notificationPreference, notificationDigestQueue, users } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { render } from "@react-email/render";
import { createElement } from "react";
import { sendPlatformEmail } from "@/lib/email/resend-client";
import { NotificationDigestEmail } from "@/lib/email/templates/notification-digest";
import type { InferInsertModel } from "drizzle-orm";

type NotificationType = InferInsertModel<typeof notification>["type"];

interface SendNotificationParams {
  orgId: string;
  userId: string;
  type: NotificationType;
  title: string;
  body?: string;
  entityType?: string;
  entityId?: string;
}

export async function sendNotification(params: SendNotificationParams) {
  // 1. Always create in-app notification
  const [created] = await db
    .insert(notification)
    .values({
      organizationId: params.orgId,
      userId: params.userId,
      type: params.type,
      title: params.title,
      body: params.body || null,
      entityType: params.entityType || null,
      entityId: params.entityId || null,
      channel: "in_app",
    })
    .returning();

  // 2. Check user's email preference for this notification type
  const emailPref = await db.query.notificationPreference.findFirst({
    where: and(
      eq(notificationPreference.organizationId, params.orgId),
      eq(notificationPreference.userId, params.userId),
      eq(notificationPreference.type, params.type),
      eq(notificationPreference.channel, "email")
    ),
  });

  // If email is not enabled for this type, we're done
  if (!emailPref || !emailPref.enabled) {
    return created;
  }

  // 3. Check digest interval
  if (emailPref.digestIntervalMinutes > 0) {
    // Queue for digest processing
    await db.insert(notificationDigestQueue).values({
      organizationId: params.orgId,
      userId: params.userId,
      notificationId: created.id,
    });
  } else {
    // Send immediately
    try {
      const user = await db.query.users.findFirst({
        where: eq(users.id, params.userId),
      });

      if (user?.email) {
        const element = createElement(NotificationDigestEmail, {
          userName: user.name || "there",
          orgName: "dubbl",
          notifications: [
            {
              type: params.type,
              title: params.title,
              body: params.body,
              createdAt: "Just now",
            },
          ],
          dashboardUrl: `${process.env.NEXT_PUBLIC_APP_URL || "https://app.dubbl.dev"}/notifications`,
        });

        const html = await render(element);

        await sendPlatformEmail({
          to: user.email,
          subject: `dubbl: ${params.title}`,
          html,
        });
      }
    } catch (err) {
      // Don't fail the notification creation if email fails
      console.error("Failed to send immediate notification email:", err);
    }
  }

  return created;
}
