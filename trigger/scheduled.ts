import { schedules } from "@trigger.dev/sdk";
import { processBackupMaintenance } from "@/lib/api/backup-maintenance";
import { processBookkeepingMaintenance } from "@/lib/api/bookkeeping-maintenance";
import { processInvoicingMaintenance } from "@/lib/api/invoicing-maintenance";
import { processTrashPurgeMaintenance } from "@/lib/api/trash-purge-maintenance";
import { retryFailedStripeEvents } from "@/lib/integrations/stripe/retry";
import { processDigests } from "@/lib/notifications/digest-processor";
import { processReportSchedules } from "@/lib/reports/schedule-processor";
import { processExchangeRateSync } from "@/lib/currency/rate-sync";
import { processFxRevaluation } from "@/lib/api/fx-revaluation";

const retry = {
  maxAttempts: 3,
  factor: 2,
  minTimeoutInMs: 30_000,
  maxTimeoutInMs: 10 * 60_000,
  randomize: true,
};

export const notificationDigestTask = schedules.task({
  id: "notification-digest",
  cron: "*/15 * * * *",
  retry,
  run: async () => processDigests(),
});

export const reportSchedulesTask = schedules.task({
  id: "report-schedules",
  cron: "0 * * * *",
  retry,
  run: async () => processReportSchedules(),
});

export const stripeRetryTask = schedules.task({
  id: "stripe-retry",
  cron: "0 * * * *",
  retry,
  run: async () => retryFailedStripeEvents(),
});

export const invoicingTask = schedules.task({
  id: "invoicing-maintenance",
  cron: "0 1 * * *",
  retry,
  run: async () => processInvoicingMaintenance(),
});

export const bookkeepingTask = schedules.task({
  id: "bookkeeping-maintenance",
  cron: "0 2 * * *",
  retry,
  run: async () => processBookkeepingMaintenance(),
});

export const trashPurgeTask = schedules.task({
  id: "trash-purge",
  cron: "0 3 * * *",
  retry,
  run: async () => processTrashPurgeMaintenance(),
});

export const backupTask = schedules.task({
  id: "scheduled-backups",
  cron: "0 4 * * *",
  retry,
  run: async () => processBackupMaintenance(),
});

export const exchangeRateSyncTask = schedules.task({
  id: "exchange-rate-sync",
  cron: "0 6 * * *", // daily, after ECB has published the prior day's rates
  retry,
  run: async () => processExchangeRateSync(),
});

export const fxRevaluationTask = schedules.task({
  id: "fx-revaluation",
  cron: "0 7 1 * *", // monthly on the 1st, after the daily rate sync
  retry,
  run: async () => {
    const now = new Date();
    // Revalue as of the last day of the previous month; reverse on the 1st.
    const asOfDate = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0)
    )
      .toISOString()
      .slice(0, 10);
    const reversalDate = now.toISOString().slice(0, 10);
    return processFxRevaluation(asOfDate, reversalDate);
  },
});
