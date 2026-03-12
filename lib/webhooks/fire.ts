import { db } from "@/lib/db";
import { webhook } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { notDeleted } from "@/lib/db/soft-delete";
import { deliverWebhook } from "./deliver";

export async function fireWebhookEvent(
  orgId: string,
  event: string,
  payload: Record<string, unknown>,
) {
  // Query active webhooks for this org that are not soft-deleted
  const webhooks = await db.query.webhook.findMany({
    where: and(
      eq(webhook.organizationId, orgId),
      eq(webhook.isActive, true),
      notDeleted(webhook.deletedAt),
    ),
  });

  // Filter by event (events is a jsonb string array)
  const matching = webhooks.filter((wh) => {
    const events = (wh.events || []) as string[];
    return events.includes(event);
  });

  // Deliver to each (fire-and-forget)
  const enrichedPayload = {
    event_type: event,
    organization_id: orgId,
    ...payload,
  };

  for (const wh of matching) {
    deliverWebhook(wh.id, event, enrichedPayload).catch(console.error);
  }

  return { delivered: matching.length };
}
