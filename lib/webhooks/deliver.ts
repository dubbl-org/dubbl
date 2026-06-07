import crypto from "crypto";
import { tasks } from "@trigger.dev/sdk";
import { db } from "@/lib/db";
import { webhook, webhookDelivery } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import type { retryWebhookDeliveryTask } from "@/trigger/webhooks";

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
      const [updated] = await db
        .update(webhookDelivery)
        .set({
          status: "success",
          responseStatus: res.status,
          responseBody,
          attempts: 1,
          deliveredAt: new Date(),
        })
        .where(eq(webhookDelivery.id, delivery.id))
        .returning();
      return updated;
    } else {
      await scheduleRetry(delivery.id, 1, res.status, responseBody);
    }
  } catch (err) {
    await scheduleRetry(delivery.id, 1, null, String(err));
  }

  return db.query.webhookDelivery.findFirst({
    where: eq(webhookDelivery.id, delivery.id),
  });
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

  if (status === "retrying") {
    await triggerWebhookRetry(deliveryId, nextRetryAt);
  }
}

async function triggerWebhookRetry(deliveryId: string, nextRetryAt: Date) {
  if (!process.env.TRIGGER_SECRET_KEY) {
    return;
  }

  try {
    await tasks.trigger<typeof retryWebhookDeliveryTask>(
      "webhook-delivery-retry",
      { deliveryId },
      {
        delay: nextRetryAt,
        idempotencyKey: `webhook-delivery-retry:${deliveryId}:${nextRetryAt.toISOString()}`,
      }
    );
  } catch (err) {
    console.error(`Failed to schedule Trigger.dev webhook retry ${deliveryId}:`, err);
  }
}

export async function retryWebhookDeliveryById(deliveryId: string) {
  const delivery = await db.query.webhookDelivery.findFirst({
    where: eq(webhookDelivery.id, deliveryId),
  });

  if (!delivery || delivery.status !== "retrying") {
    return { deliveryId, skipped: true, reason: "not_retrying" };
  }

  if (delivery.nextRetryAt && delivery.nextRetryAt > new Date()) {
    return { deliveryId, skipped: true, reason: "not_due" };
  }

  const wh = await db.query.webhook.findFirst({
    where: eq(webhook.id, delivery.webhookId),
  });

  if (!wh || !wh.isActive) {
    await db
      .update(webhookDelivery)
      .set({ status: "failed", nextRetryAt: null })
      .where(eq(webhookDelivery.id, delivery.id));
    return { deliveryId, skipped: true, reason: "webhook_inactive" };
  }

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

      return { deliveryId, status: "success", attempts: nextAttempt };
    }

    await scheduleRetry(delivery.id, nextAttempt, res.status, responseBody);
    return { deliveryId, status: "retrying", attempts: nextAttempt };
  } catch (err) {
    await scheduleRetry(delivery.id, nextAttempt, null, String(err));
    return { deliveryId, status: "retrying", attempts: nextAttempt };
  }
}
