import { db } from "@/lib/db";
import {
  invoice,
  journalEntry,
  journalLine,
  revenueEntry,
  revenueSchedule,
} from "@/lib/db/schema";
import { and, asc, eq, ne } from "drizzle-orm";
import { notDeleted } from "@/lib/db/soft-delete";
import type { AuthContext } from "@/lib/api/auth-context";
import { assertNotLocked, PeriodLockedError } from "@/lib/api/period-lock";
import { DEFERRED_REVENUE_CODE, ensureAccountForCode, findAccountForCode } from "@/lib/api/account-roles";
import {
  assertBaseRateAvailable,
  getNextEntryNumber,
  resolveBaseRate,
  toBaseLines,
} from "@/lib/api/journal-automation";
import {
  autoRecognizes,
  buildRevenuePeriods,
  deferralAmount,
  recognitionDate,
  type RevenueMethod,
} from "@/lib/api/revenue-schedule-math";

/**
 * Revenue schedules (deferred revenue)
 * ====================================
 * An invoice books its income the day it's issued. A schedule spreads part of
 * that income over time, so the posting has two halves:
 *
 *   1. On creation, the scheduled amount is MOVED out of income into deferred
 *      revenue (DR income account / CR Deferred Revenue), dated the invoice date.
 *   2. Each period then moves its share back (DR Deferred Revenue / CR income),
 *      either by hand ("Count next period") or by the daily bookkeeping job.
 *
 * Cancelling returns whatever wasn't counted yet to income, so the invoice's
 * income is never lost or counted twice. Amounts are integer cents in the
 * invoice's currency, converted at the invoice-date rate (the same rate the
 * invoice posted at). Dates in a locked period roll forward to today.
 */

export class RevenueScheduleError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

type Tx = Parameters<Parameters<(typeof db)["transaction"]>[0]>[0];

/** Who is posting: the signed-in user, or the scheduled job (no user). */
export interface RevenuePostingActor {
  organizationId: string;
  userId: string | null;
  /** Used for the period-lock check (advisors may post up to their lock date). */
  auth?: AuthContext;
}

const POSTED_INVOICE_STATUSES = ["sent", "partial", "paid", "overdue"];

const today = () => new Date().toISOString().slice(0, 10);

/**
 * The preferred date, or today when the preferred date is in a locked period
 * (a catch-up posting lands in the current open period). Throws when today is
 * locked too.
 */
async function openPostingDate(actor: RevenuePostingActor, preferred: string): Promise<string> {
  try {
    await assertNotLocked(actor.organizationId, preferred, actor.auth);
    return preferred;
  } catch (err) {
    if (!(err instanceof PeriodLockedError) || preferred >= today()) throw err;
    await assertNotLocked(actor.organizationId, today(), actor.auth);
    return today();
  }
}

async function ensureDeferredAccount(organizationId: string, baseCurrency: string, exec: typeof db | Tx) {
  const code = DEFERRED_REVENUE_CODE;
  const account = await ensureAccountForCode(
    organizationId,
    // Created only if the chart has no income-in-advance account yet.
    { code, name: "Unearned Revenue", type: "liability", subType: "current" },
    baseCurrency,
    exec
  );
  if (!account) throw new RevenueScheduleError("Could not find or create the Deferred Revenue account", 500);
  return account;
}

type InvoiceWithLines = typeof invoice.$inferSelect & {
  lines: { id: string; accountId: string | null; amount: number }[];
};

/** Lines that actually credited an income account when the invoice posted. */
function postedLines(inv: InvoiceWithLines) {
  return inv.lines.filter((l) => l.accountId && l.amount > 0);
}

/**
 * The income account the schedule moves money out of and back into: the
 * chosen line's account, or the invoice's single income account. Null when the
 * invoice spreads over several accounts and no line was chosen.
 */
function scheduleIncomeAccount(inv: InvoiceWithLines, invoiceLineId: string | null): string | null {
  if (invoiceLineId) return inv.lines.find((l) => l.id === invoiceLineId)?.accountId ?? null;
  const ids = [...new Set(postedLines(inv).map((l) => l.accountId as string))];
  return ids.length === 1 ? ids[0] : null;
}

async function postEntry(
  tx: Tx,
  actor: RevenuePostingActor,
  data: {
    date: string;
    description: string;
    reference: string;
    sourceType: string;
    sourceId: string;
    debitAccountId: string;
    creditAccountId: string;
    amount: number;
    currency: string;
    rate: number;
  }
) {
  const entryNumber = await getNextEntryNumber(actor.organizationId, tx);
  const [je] = await tx
    .insert(journalEntry)
    .values({
      organizationId: actor.organizationId,
      entryNumber,
      date: data.date,
      description: data.description,
      reference: data.reference,
      status: "posted",
      sourceType: data.sourceType,
      sourceId: data.sourceId,
      postedAt: new Date(),
      createdBy: actor.userId,
    })
    .returning();
  await tx.insert(journalLine).values(
    toBaseLines(
      [
        { journalEntryId: je.id, accountId: data.debitAccountId, description: data.description, debitAmount: data.amount, creditAmount: 0 },
        { journalEntryId: je.id, accountId: data.creditAccountId, description: data.description, debitAmount: 0, creditAmount: data.amount },
      ],
      data.currency,
      data.rate
    )
  );
  return je;
}

async function findDeferral(scheduleId: string, organizationId: string, exec: typeof db | Tx = db) {
  return exec.query.journalEntry.findFirst({
    where: and(
      eq(journalEntry.organizationId, organizationId),
      eq(journalEntry.sourceType, "revenue_deferral"),
      eq(journalEntry.sourceId, scheduleId)
    ),
  });
}

export interface CreateRevenueScheduleInput {
  invoiceId: string;
  invoiceLineId?: string | null;
  /** Integer cents, in the invoice's currency. */
  totalAmount: number;
  startDate: string;
  endDate: string;
  method: RevenueMethod;
}

/**
 * Create a schedule for a sent invoice, generate its periods and move the
 * scheduled amount from income into deferred revenue. All in one transaction.
 */
export async function createRevenueSchedule(actor: RevenuePostingActor, input: CreateRevenueScheduleInput) {
  const { organizationId } = actor;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(input.endDate)) {
    throw new RevenueScheduleError("Start and end dates must be YYYY-MM-DD");
  }
  if (input.endDate < input.startDate) throw new RevenueScheduleError("The end date must be on or after the start date");
  if (!Number.isInteger(input.totalAmount) || input.totalAmount <= 0) {
    throw new RevenueScheduleError("Total amount must be a positive whole number of cents");
  }

  const inv = await db.query.invoice.findFirst({
    where: and(eq(invoice.id, input.invoiceId), eq(invoice.organizationId, organizationId), notDeleted(invoice.deletedAt)),
    with: { lines: true },
  });
  if (!inv) throw new RevenueScheduleError("Invoice not found", 404);
  if (!POSTED_INVOICE_STATUSES.includes(inv.status)) {
    throw new RevenueScheduleError("Send or approve the invoice first. Only invoices that have booked their income can be scheduled.");
  }

  const lineId = input.invoiceLineId || null;
  const line = lineId ? inv.lines.find((l) => l.id === lineId) : null;
  if (lineId && !line) throw new RevenueScheduleError("That line isn't on this invoice");

  const incomeAccountId = scheduleIncomeAccount(inv, lineId);
  if (!incomeAccountId) {
    throw new RevenueScheduleError(
      lineId
        ? "That line has no income account, so there's no income to spread"
        : "This invoice's lines use different income accounts. Choose the line to spread."
    );
  }

  // Don't defer more than the invoice (or line) booked, less what other live
  // schedules already took. Cancelled schedules gave their share back.
  const existing = await db.query.revenueSchedule.findMany({
    where: and(
      eq(revenueSchedule.organizationId, organizationId),
      eq(revenueSchedule.invoiceId, inv.id),
      ne(revenueSchedule.status, "cancelled")
    ),
  });
  const invoiceNet = postedLines(inv).reduce((s, l) => s + l.amount, 0);
  let available = invoiceNet - existing.reduce((s, x) => s + x.totalAmount, 0);
  if (line) {
    const onLine = existing.filter((x) => x.invoiceLineId === line.id).reduce((s, x) => s + x.totalAmount, 0);
    available = Math.min(available, line.amount - onLine);
  }
  if (input.totalAmount > available) {
    throw new RevenueScheduleError(
      `Only ${(Math.max(0, available) / 100).toFixed(2)} ${inv.currencyCode} of this ${line ? "line" : "invoice"}'s income (before tax) is left to schedule`
    );
  }

  await assertBaseRateAvailable(organizationId, inv.currencyCode, inv.issueDate);
  const { base, currency, rate } = await resolveBaseRate(organizationId, inv.currencyCode, inv.issueDate);
  const deferralDate = await openPostingDate(actor, inv.issueDate);
  const periods = buildRevenuePeriods(input.totalAmount, input.startDate, input.endDate, input.method);

  const scheduleId = await db.transaction(async (tx) => {
    const deferred = await ensureDeferredAccount(organizationId, base, tx);
    const [schedule] = await tx
      .insert(revenueSchedule)
      .values({
        organizationId,
        invoiceId: inv.id,
        invoiceLineId: lineId,
        totalAmount: input.totalAmount,
        startDate: input.startDate,
        endDate: input.endDate,
        method: input.method,
        deferredRevenueAccountId: deferred.id,
        revenueAccountId: incomeAccountId,
        createdBy: actor.userId,
      })
      .returning();

    await tx.insert(revenueEntry).values(periods.map((p) => ({ ...p, scheduleId: schedule.id })));

    // Move the scheduled income out of the income account until it's earned.
    await postEntry(tx, actor, {
      date: deferralDate,
      description: `Defer income on invoice ${inv.invoiceNumber} to a revenue schedule`,
      reference: inv.invoiceNumber,
      sourceType: "revenue_deferral",
      sourceId: schedule.id,
      debitAccountId: incomeAccountId,
      creditAccountId: deferred.id,
      amount: input.totalAmount,
      currency,
      rate,
    });
    return schedule.id;
  });

  return getRevenueSchedule(organizationId, scheduleId);
}

/** A schedule with its periods (in order) and the invoice number. */
export async function getRevenueSchedule(organizationId: string, id: string) {
  const s = await db.query.revenueSchedule.findFirst({
    where: and(eq(revenueSchedule.id, id), eq(revenueSchedule.organizationId, organizationId)),
    with: {
      entries: { orderBy: asc(revenueEntry.sortOrder) },
      invoice: { columns: { invoiceNumber: true, currencyCode: true, contactId: true }, with: { contact: { columns: { name: true } } } },
    },
  });
  if (!s) return null;
  const { invoice: inv, ...rest } = s;
  return {
    ...rest,
    invoiceNumber: inv?.invoiceNumber ?? null,
    currencyCode: inv?.currencyCode ?? null,
    contactName: inv?.contact?.name ?? null,
  };
}

/**
 * Count the schedule's next uncounted period as income: DR Deferred Revenue /
 * CR the income account. Older schedules created before deferral existed get
 * their deferral posted first, so the period isn't counted on top of the
 * invoice's own income. Returns the counted period.
 */
export async function recognizeNextRevenueEntry(actor: RevenuePostingActor, scheduleId: string) {
  const { organizationId } = actor;
  const schedule = await db.query.revenueSchedule.findFirst({
    where: and(eq(revenueSchedule.id, scheduleId), eq(revenueSchedule.organizationId, organizationId)),
    with: {
      entries: { orderBy: asc(revenueEntry.sortOrder) },
      invoice: { with: { lines: true } },
    },
  });
  if (!schedule) throw new RevenueScheduleError("Revenue schedule not found", 404);
  if (schedule.status !== "active") throw new RevenueScheduleError("Schedule is not active");

  const sorted = [...schedule.entries].sort((a, b) => a.periodDate.localeCompare(b.periodDate) || a.sortOrder - b.sortOrder);
  const next = sorted.find((e) => !e.recognized);
  if (!next) throw new RevenueScheduleError("All entries have already been recognized");

  const inv = schedule.invoice;
  if (!inv) throw new RevenueScheduleError("The schedule's invoice no longer exists");

  let incomeAccountId = schedule.revenueAccountId ?? scheduleIncomeAccount(inv, schedule.invoiceLineId);
  if (!incomeAccountId) incomeAccountId = (await findAccountForCode(organizationId, "4000"))?.id ?? null;
  if (!incomeAccountId) throw new RevenueScheduleError("No income account found for this schedule");

  await assertBaseRateAvailable(organizationId, inv.currencyCode, inv.issueDate);
  const { base, currency, rate } = await resolveBaseRate(organizationId, inv.currencyCode, inv.issueDate);

  const hasDeferral = !!(await findDeferral(schedule.id, organizationId));
  const deferralDate = hasDeferral ? null : await openPostingDate(actor, inv.issueDate);
  const date = await openPostingDate(actor, recognitionDate(next.periodDate, inv.issueDate, today()));
  const remainingAfter = sorted.filter((e) => !e.recognized && e.id !== next.id).length;
  const index = sorted.indexOf(next) + 1;

  return db.transaction(async (tx) => {
    const deferredAccountId =
      schedule.deferredRevenueAccountId ?? (await ensureDeferredAccount(organizationId, base, tx)).id;

    if (deferralDate) {
      const amount = deferralAmount(schedule.totalAmount, schedule.entries);
      if (amount > 0) {
        await postEntry(tx, actor, {
          date: deferralDate,
          description: `Defer income on invoice ${inv.invoiceNumber} to a revenue schedule`,
          reference: inv.invoiceNumber,
          sourceType: "revenue_deferral",
          sourceId: schedule.id,
          debitAccountId: incomeAccountId,
          creditAccountId: deferredAccountId,
          amount,
          currency,
          rate,
        });
      }
    }

    const je = await postEntry(tx, actor, {
      date,
      description: `Revenue recognition ${inv.invoiceNumber} - period ${index} of ${sorted.length}`,
      reference: inv.invoiceNumber,
      sourceType: "revenue_recognition",
      sourceId: schedule.id,
      debitAccountId: deferredAccountId,
      creditAccountId: incomeAccountId,
      amount: next.amount,
      currency,
      rate,
    });

    // Guard against a concurrent count of the same period (job + click).
    const [counted] = await tx
      .update(revenueEntry)
      .set({ recognized: true, journalEntryId: je.id })
      .where(and(eq(revenueEntry.id, next.id), eq(revenueEntry.recognized, false)))
      .returning();
    if (!counted) throw new RevenueScheduleError("That period was just counted. Refresh and try again.", 409);

    await tx
      .update(revenueSchedule)
      .set({
        recognizedAmount: schedule.recognizedAmount + next.amount,
        revenueAccountId: incomeAccountId,
        deferredRevenueAccountId: deferredAccountId,
        status: remainingAfter === 0 ? "completed" : "active",
        updatedAt: new Date(),
      })
      .where(eq(revenueSchedule.id, schedule.id));

    return counted;
  });
}

/**
 * Cancel an active schedule. Whatever hasn't been counted yet goes back to the
 * income account (DR Deferred Revenue / CR income, dated today), so the
 * invoice's full income stays on the books. Already counted periods stay.
 */
export async function cancelRevenueSchedule(actor: RevenuePostingActor, scheduleId: string) {
  const { organizationId } = actor;
  const schedule = await db.query.revenueSchedule.findFirst({
    where: and(eq(revenueSchedule.id, scheduleId), eq(revenueSchedule.organizationId, organizationId)),
    with: { entries: true, invoice: { columns: { invoiceNumber: true, currencyCode: true, issueDate: true } } },
  });
  if (!schedule) throw new RevenueScheduleError("Revenue schedule not found", 404);
  if (schedule.status !== "active") throw new RevenueScheduleError("Only schedules in progress can be cancelled");

  const remaining = schedule.entries.filter((e) => !e.recognized).reduce((s, e) => s + e.amount, 0);
  const deferral = await findDeferral(schedule.id, organizationId);
  const giveBack = deferral && remaining > 0 && schedule.deferredRevenueAccountId && schedule.revenueAccountId;

  let date: string | null = null;
  let fx: { currency: string; rate: number } | null = null;
  if (giveBack && schedule.invoice) {
    date = await openPostingDate(actor, today());
    fx = await resolveBaseRate(organizationId, schedule.invoice.currencyCode, schedule.invoice.issueDate);
  }

  return db.transaction(async (tx) => {
    if (giveBack && date && fx && schedule.invoice) {
      await postEntry(tx, actor, {
        date,
        description: `Revenue schedule on invoice ${schedule.invoice.invoiceNumber} cancelled: uncounted income returned`,
        reference: schedule.invoice.invoiceNumber,
        sourceType: "revenue_schedule_cancel",
        sourceId: schedule.id,
        debitAccountId: schedule.deferredRevenueAccountId!,
        creditAccountId: schedule.revenueAccountId!,
        amount: remaining,
        currency: fx.currency,
        rate: fx.rate,
      });
    }
    const [updated] = await tx
      .update(revenueSchedule)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(revenueSchedule.id, schedule.id))
      .returning();
    return updated;
  });
}

/**
 * Daily job: count every period whose date has arrived on active schedules
 * (all orgs). Milestone schedules are counted by hand only. A schedule that
 * can't post (locked period, missing rate…) is skipped and retried tomorrow.
 */
export async function processDueRevenueRecognition(): Promise<{ processed: number; skipped: number }> {
  const schedules = await db.query.revenueSchedule.findMany({
    where: eq(revenueSchedule.status, "active"),
    with: { entries: true },
  });
  const now = today();
  let processed = 0;
  let skipped = 0;

  for (const schedule of schedules) {
    if (!autoRecognizes(schedule.method)) {
      skipped++;
      continue;
    }
    const due = schedule.entries.filter((e) => !e.recognized && e.periodDate <= now).length;
    if (due === 0) {
      skipped++;
      continue;
    }
    const actor: RevenuePostingActor = { organizationId: schedule.organizationId, userId: null };
    try {
      for (let i = 0; i < due; i++) {
        await recognizeNextRevenueEntry(actor, schedule.id);
        processed++;
      }
    } catch (err) {
      console.error(`[revenue-recognition] schedule ${schedule.id}:`, err instanceof Error ? err.message : err);
      skipped++;
    }
  }

  return { processed, skipped };
}

/** True when the invoice has a schedule still in progress (blocks voiding). */
export async function hasActiveRevenueSchedule(organizationId: string, invoiceId: string) {
  const s = await db.query.revenueSchedule.findFirst({
    where: and(
      eq(revenueSchedule.organizationId, organizationId),
      eq(revenueSchedule.invoiceId, invoiceId),
      eq(revenueSchedule.status, "active")
    ),
    columns: { id: true },
  });
  return !!s;
}
