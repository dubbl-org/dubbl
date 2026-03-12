import crypto from "crypto";
import { db } from "@/lib/db";
import { webhook, webhookDelivery } from "@/lib/db/schema";
import { eq, and, lte } from "drizzle-orm";

// Retry backoff schedule in minutes
const RETRY_BACKOFF = [1, 5, 30, 120, 720]; // 1m, 5m, 30m, 2h, 12h

export async function deliverWebhook(
  webhookId: string,
  event: string,
  payload: Record<string, unknown>,
) {
  // 1. Fetch webhook
  const wh = await db.query.webhook.findFirst({
    where: eq(webhook.id, webhookId),
  });
  if (!wh) return;

  // 2. Create delivery record with status pending
  const [delivery] = await db
    .insert(webhookDelivery)
    .values({
      webhookId,
      event,
      payload,
      status: "pending",
    })
    .returning();

  // 3. Sign payload with HMAC-SHA256
  const body = JSON.stringify(payload);
  const signature = crypto
    .createHmac("sha256", wh.secret)
    .update(body)
    .digest("hex");

  // 4. POST to URL with headers
  try {
    const res = await fetch(wh.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Dubbl-Event": event,
        "X-Dubbl-Delivery-Id": delivery.id,
        "X-Dubbl-Signature": signature,
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });

    const responseBody = await res.text().catch(() => "");

    if (res.ok) {
      await db
        .update(webhookDelivery)
        .set({
          status: "success",
          responseStatus: res.status,
          responseBody,
          attempts: 1,
          deliveredAt: new Date(),
        })
        .where(eq(webhookDelivery.id, delivery.id));
    } else {
      await scheduleRetry(delivery.id, 1, res.status, responseBody);
    }
  } catch (err) {
    await scheduleRetry(delivery.id, 1, null, String(err));
  }
}

async function scheduleRetry(
  deliveryId: string,
  attempt: number,
  responseStatus: number | null,
  responseBody: string,
) {
  const backoffIndex = Math.min(attempt - 1, RETRY_BACKOFF.length - 1);
  const nextRetryMinutes = RETRY_BACKOFF[backoffIndex];
  const nextRetryAt = new Date(Date.now() + nextRetryMinutes * 60 * 1000);
  const maxAttempts = 5;
  const status = attempt >= maxAttempts ? "failed" : "retrying";

  await db
    .update(webhookDelivery)
    .set({
      status,
      attempts: attempt,
      responseStatus,
      responseBody,
      nextRetryAt: status === "retrying" ? nextRetryAt : null,
    })
    .where(eq(webhookDelivery.id, deliveryId));
}

/**
 * Called by cron to retry pending deliveries.
 * Queries deliveries where status = "retrying" and nextRetryAt <= now,
 * then attempts redelivery for each.
 */
export async function retryFailedDeliveries() {
  const now = new Date();

  // 1. Query deliveries ready for retry
  const pendingDeliveries = await db.query.webhookDelivery.findMany({
    where: and(
      eq(webhookDelivery.status, "retrying"),
      lte(webhookDelivery.nextRetryAt, now),
    ),
  });

  for (const delivery of pendingDeliveries) {
    // 2. Fetch the parent webhook
    const wh = await db.query.webhook.findFirst({
      where: eq(webhook.id, delivery.webhookId),
    });

    // Skip if webhook was deleted or deactivated
    if (!wh || !wh.isActive) {
      await db
        .update(webhookDelivery)
        .set({ status: "failed", nextRetryAt: null })
        .where(eq(webhookDelivery.id, delivery.id));
      continue;
    }

    // 3. Sign and send the payload
    const body = JSON.stringify(delivery.payload);
    const signature = crypto
      .createHmac("sha256", wh.secret)
      .update(body)
      .digest("hex");

    const nextAttempt = delivery.attempts + 1;

    try {
      const res = await fetch(wh.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Dubbl-Event": delivery.event,
          "X-Dubbl-Delivery-Id": delivery.id,
          "X-Dubbl-Signature": signature,
        },
        body,
        signal: AbortSignal.timeout(10_000),
      });

      const responseBody = await res.text().catch(() => "");

      if (res.ok) {
        // 4a. Success - mark delivered
        await db
          .update(webhookDelivery)
          .set({
            status: "success",
            responseStatus: res.status,
            responseBody,
            attempts: nextAttempt,
            deliveredAt: new Date(),
            nextRetryAt: null,
          })
          .where(eq(webhookDelivery.id, delivery.id));
      } else {
        // 4b. Failed - schedule next retry or mark as failed
        await scheduleRetry(delivery.id, nextAttempt, res.status, responseBody);
      }
    } catch (err) {
      await scheduleRetry(delivery.id, nextAttempt, null, String(err));
    }
  }
}
