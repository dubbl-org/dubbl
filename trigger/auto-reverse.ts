import { schedules } from "@trigger.dev/sdk";
import { processAutoReversals } from "@/lib/api/auto-reverse";

const retry = {
  maxAttempts: 3,
  factor: 2,
  minTimeoutInMs: 30_000,
  maxTimeoutInMs: 10 * 60_000,
  randomize: true,
};

/**
 * Daily auto-reversing-journal job. Posts the mirror reversing entry for every
 * posted entry whose autoReverseDate has arrived and which hasn't been reversed
 * yet (accruals / prepayments). Runs after the daily FX rate sync.
 */
export const autoReverseTask = schedules.task({
  id: "auto-reverse-journals",
  cron: "0 5 * * *", // daily, before period-end maintenance
  retry,
  run: async () => processAutoReversals(),
});
