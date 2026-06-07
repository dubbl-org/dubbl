import { task } from "@trigger.dev/sdk";
import { retryWebhookDeliveryById } from "@/lib/webhooks/deliver";

export const retryWebhookDeliveryTask = task({
  id: "webhook-delivery-retry",
  retry: {
    maxAttempts: 2,
    factor: 2,
    minTimeoutInMs: 30_000,
    maxTimeoutInMs: 5 * 60_000,
    randomize: true,
  },
  run: async (payload: { deliveryId: string }) =>
    retryWebhookDeliveryById(payload.deliveryId),
});
