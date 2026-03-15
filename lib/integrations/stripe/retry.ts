import { db } from "@/lib/db";
import { stripeSyncLog, stripeIntegration } from "@/lib/db/schema";
import { eq, and, gte, lt } from "drizzle-orm";
import { stripe as _stripeClient } from "@/lib/stripe";

// Non-null wrapper - callers already guard for null stripe
const stripe = _stripeClient!;
import { processStripeEvent } from "./sync";
import { notDeleted } from "@/lib/db/soft-delete";
import { sendNotification } from "@/lib/notifications/send";

export async function retryFailedStripeEvents(): Promise<{
  retried: number;
  succeeded: number;
  failed: number;
  exhaustedAlerts: number;
}> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  // Find failed events from the last 7 days with retryCount < 3
  const failedLogs = await db.query.stripeSyncLog.findMany({
    where: and(
      eq(stripeSyncLog.status, "failed"),
      gte(stripeSyncLog.createdAt, sevenDaysAgo),
      lt(stripeSyncLog.retryCount, 3)
    ),
    limit: 50,
  });

  let retried = 0;
  let succeeded = 0;
  let failed = 0;

  for (const log of failedLogs) {
    if (!log.stripeEventId) continue;

    // Look up the integration
    const integration = await db.query.stripeIntegration.findFirst({
      where: and(
        eq(stripeIntegration.id, log.integrationId),
        notDeleted(stripeIntegration.deletedAt)
      ),
    });

    if (!integration) continue;

    retried++;

    try {
      // Fetch the event from Stripe API
      const event = await stripe.events.retrieve(log.stripeEventId, {
        stripeAccount: integration.stripeAccountId,
      });

      await processStripeEvent(event, integration);

      // Mark as success
      await db
        .update(stripeSyncLog)
        .set({
          status: "success",
          errorMessage: null,
          retryCount: log.retryCount + 1,
        })
        .where(eq(stripeSyncLog.id, log.id));

      succeeded++;
    } catch (err) {
      // Increment retry count, keep as failed
      await db
        .update(stripeSyncLog)
        .set({
          retryCount: log.retryCount + 1,
          errorMessage: err instanceof Error ? err.message : "Unknown error",
        })
        .where(eq(stripeSyncLog.id, log.id));

      failed++;
    }
  }

  // Alert on exhausted events (failed with retryCount >= 3, not yet alerted)
  let exhaustedAlerts = 0;
  const exhaustedLogs = await db.query.stripeSyncLog.findMany({
    where: and(
      eq(stripeSyncLog.status, "failed"),
      gte(stripeSyncLog.retryCount, 3),
      gte(stripeSyncLog.createdAt, sevenDaysAgo)
    ),
    limit: 50,
  });

  // Group by integration to avoid duplicate lookups
  const byIntegration = new Map<string, typeof exhaustedLogs>();
  for (const log of exhaustedLogs) {
    const existing = byIntegration.get(log.integrationId) ?? [];
    existing.push(log);
    byIntegration.set(log.integrationId, existing);
  }

  for (const [integrationId, logs] of byIntegration) {
    const integration = await db.query.stripeIntegration.findFirst({
      where: and(
        eq(stripeIntegration.id, integrationId),
        notDeleted(stripeIntegration.deletedAt)
      ),
    });

    if (!integration?.connectedBy) continue;

    // Only send one notification per integration per run
    try {
      await sendNotification({
        orgId: integration.organizationId,
        userId: integration.connectedBy,
        type: "webhook_exhausted",
        title: `${logs.length} Stripe webhook event(s) failed after all retries`,
        body: `Integration "${integration.label}" has ${logs.length} exhausted event(s). Check the sync log for details.`,
        entityType: "stripe_integration",
        entityId: integration.id,
      });
      exhaustedAlerts++;
    } catch {
      // Non-critical, continue
    }
  }

  return { retried, succeeded, failed, exhaustedAlerts };
}
