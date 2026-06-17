import { schedules } from "@trigger.dev/sdk";
import { processRecurringJournalsMaintenance } from "@/lib/api/recurring-generate";

const retry = {
  maxAttempts: 3,
  factor: 2,
  minTimeoutInMs: 30_000,
  maxTimeoutInMs: 10 * 60_000,
  randomize: true,
};

/**
 * Daily recurring-journal job. For every org with an active journal template
 * whose nextRunDate has arrived, posts a balanced, posted manual journal entry
 * per due occurrence (catching up if the schedule is behind). DR==CR is
 * re-validated and assertNotLocked is enforced per occurrence; a locked period
 * or an imbalanced template skips just that occurrence and advances the
 * schedule. Runs alongside the other recurring/exchange-rate scheduled tasks.
 */
export const recurringJournalsTask = schedules.task({
  id: "recurring-journals",
  cron: "0 1 * * *", // daily, same window as invoicing-maintenance
  retry,
  run: async () => processRecurringJournalsMaintenance(),
});
