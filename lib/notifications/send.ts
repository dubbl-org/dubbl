import { db } from "@/lib/db";
import { notification, notificationPreference, notificationDigestQueue, users, organization } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { render } from "@react-email/render";
import { createElement } from "react";
import { sendPlatformEmail } from "@/lib/email/resend-client";
import { NotificationDigestEmail } from "@/lib/email/templates/notification-digest";
import { toAppUrl } from "@/lib/public-url";
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

// entity_id is a uuid column; outside ids (e.g. Stripe's "in_...") can't be stored there
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function sendNotification(params: SendNotificationParams) {
  const entityId = params.entityId && UUID.test(params.entityId) ? params.entityId : null;

  // 1. Always create the notification; the inbox hides types the user muted for in-app
  const [created] = await db
    .insert(notification)
    .values({
      organizationId: params.orgId,
      userId: params.userId,
      type: params.type,
      title: params.title,
      body: params.body || null,
      entityType: entityId ? params.entityType || null : null,
      entityId,
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
      const org = await db.query.organization.findFirst({
        where: eq(organization.id, params.orgId),
        columns: { name: true },
      });

      if (user?.email) {
        const element = createElement(NotificationDigestEmail, {
          userName: user.name || "there",
          orgName: org?.name || "dubbl",
          notifications: [
            {
              type: params.type,
              title: params.title,
              body: params.body,
              createdAt: "Just now",
            },
          ],
          dashboardUrl: toAppUrl("/notifications"),
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
