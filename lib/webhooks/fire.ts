import { db } from "@/lib/db";
import { webhook } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { notDeleted } from "@/lib/db/soft-delete";
import { deliverWebhook } from "./deliver";

/**
 * Deliver `event` to every active webhook of the organization subscribed to
 * it. The body has the same shape as a test delivery:
 * `{ event, organizationId, timestamp, data }`, where `data` is the record the
 * event is about (amounts in cents). Call it through the helpers in
 * ./events.ts, which wait for the change to commit first.
 */
export async function fireWebhookEvent(
  orgId: string,
  event: string,
  data: Record<string, unknown>,
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
    event,
    organizationId: orgId,
    timestamp: new Date().toISOString(),
    data,
  };

  // Each delivery is logged and retried on its own; one failing endpoint
  // doesn't hold up the others
  const results = await Promise.allSettled(
    matching.map((wh) => deliverWebhook(wh.id, event, enrichedPayload))
  );
  for (const r of results) {
    if (r.status === "rejected") console.error(r.reason);
  }

  return { delivered: matching.length };
}
