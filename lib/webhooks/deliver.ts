import crypto from "crypto";
import { tasks } from "@trigger.dev/sdk";
import { db } from "@/lib/db";
import { webhook, webhookDelivery } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import type { retryWebhookDeliveryTask } from "@/trigger/webhooks";
import { assertPublicHttpsUrl, UnsafeUrlError } from "@/lib/api/url-guard";

// Response bodies are attacker-influenced (the receiver chooses them) and are
// echoed back to the caller, so keep only a bounded prefix.
const MAX_STORED_RESPONSE_BYTES = 4000;

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
    // Re-validate at send time: a row may predate the guard, and the DNS answer
    // may have changed since it was created.
    await assertPublicHttpsUrl(wh.url);

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
      // A redirect would let a public URL reach an internal address that the
      // pre-flight check just cleared.
      redirect: "manual",
    });

    const responseBody = (await res.text().catch(() => "")).slice(0, MAX_STORED_RESPONSE_BYTES);

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
    // A blocked URL is not retryable — retrying just repeats the refusal.
    const blocked = err instanceof UnsafeUrlError;
    await scheduleRetry(
      delivery.id,
      1,
      null,
      blocked ? `Blocked: ${err.message}` : String(err),
      blocked
    );
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
  terminal = false,
) {
  const backoffIndex = Math.min(attempt - 1, RETRY_BACKOFF.length - 1);
  const nextRetryMinutes = RETRY_BACKOFF[backoffIndex];
  const nextRetryAt = new Date(Date.now() + nextRetryMinutes * 60 * 1000);
  const maxAttempts = 5;
  const status = terminal || attempt >= maxAttempts ? "failed" : "retrying";

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
    await assertPublicHttpsUrl(wh.url);
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
      redirect: "manual",
    });

    const responseBody = (await res.text().catch(() => "")).slice(0, MAX_STORED_RESPONSE_BYTES);

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
