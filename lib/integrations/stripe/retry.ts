import { db } from "@/lib/db";
import { stripeSyncLog, stripeIntegration } from "@/lib/db/schema";
import { eq, and, gte, lt } from "drizzle-orm";
import { stripe } from "@/lib/stripe";
import { processStripeEvent } from "./sync";
import { notDeleted } from "@/lib/db/soft-delete";

export async function retryFailedStripeEvents(): Promise<{
  retried: number;
  succeeded: number;
  failed: number;
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

  return { retried, succeeded, failed };
}
