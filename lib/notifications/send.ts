import { db } from "@/lib/db";
import { notification } from "@/lib/db/schema";
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

  return created;
}
