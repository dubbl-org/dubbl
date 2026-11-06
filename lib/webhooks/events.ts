import { after } from "next/server";
import { db } from "@/lib/db";
import {
  approvalRequest,
  bill,
  contact,
  expenseClaim,
  invoice,
  journalEntry,
  payment,
  paymentAllocation,
  webhook,
  type webhookEventEnum,
} from "@/lib/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { notDeleted } from "@/lib/db/soft-delete";
import { fireWebhookEvent } from "./fire";

export type WebhookEvent = (typeof webhookEventEnum.enumValues)[number];

type Loader = () => Promise<Record<string, unknown>[]>;

/**
 * Send `event` to the organization's subscribed webhooks once the current
 * request is done, so the record has committed (or rolled back) by then.
 * `load` reads the records afresh and returns the ones the event applies to;
 * an empty list (the transaction rolled back, the status isn't what the event
 * says) sends nothing. Never throws: a webhook must not break the operation.
 *
 * Outside a request (background jobs) the event waits in a queue that the job
 * drains when it finishes (`withWebhookEvents`). A timer also sends anything
 * left waiting for longer than a transaction plausibly stays open.
 */
export function queueWebhookEvent(orgId: string, event: WebhookEvent, load: Loader) {
  const run = () => sendWebhookEvent(orgId, event, load);
  try {
    after(run);
  } catch {
    pending.push({ run, queuedAt: Date.now() });
    setTimeout(() => void flushPendingWebhookEvents(STALE_MS), STALE_MS + 100);
  }
}

/** Send now, for changes that have already committed. Never throws. */
export async function sendWebhookEvent(orgId: string, event: WebhookEvent, load: Loader) {
  try {
    if (!(await hasSubscribers(orgId, event))) return;
    for (const data of await load()) {
      await fireWebhookEvent(orgId, event, data);
    }
  } catch (err) {
    console.error(`[webhooks] failed to send ${event}:`, err);
  }
}

const STALE_MS = 15_000;
const pending: { run: () => Promise<void>; queuedAt: number }[] = [];

/**
 * Send the events queued outside a request: all of them when a background
 * job ends, or only those older than `olderThanMs` (the timer fallback).
 */
export async function flushPendingWebhookEvents(olderThanMs = 0) {
  const cutoff = Date.now() - olderThanMs;
  const due = pending.filter((p) => p.queuedAt <= cutoff);
  for (const p of due) pending.splice(pending.indexOf(p), 1);
  for (const p of due) await p.run();
}

/** Run a background job, then send the webhook events it queued. */
export async function withWebhookEvents<T>(job: Promise<T>): Promise<T> {
  try {
    return await job;
  } finally {
    await flushPendingWebhookEvents();
  }
}

async function hasSubscribers(orgId: string, event: WebhookEvent) {
  const hooks = await db.query.webhook.findMany({
    where: and(
      eq(webhook.organizationId, orgId),
      eq(webhook.isActive, true),
      notDeleted(webhook.deletedAt)
    ),
    columns: { events: true },
  });
  return hooks.some((h) => ((h.events || []) as string[]).includes(event));
}

const unique = (ids: (string | null | undefined)[]) =>
  [...new Set(ids.filter((id): id is string => !!id))];

// ---------------------------------------------------------------------------
// One helper per event, called from the places those things happen.
// ---------------------------------------------------------------------------

export function emitInvoiceCreated(orgId: string, invoiceIds: (string | null | undefined)[]) {
  const ids = unique(invoiceIds);
  if (ids.length === 0) return;
  queueWebhookEvent(orgId, "invoice.created", () =>
    db.query.invoice.findMany({
      where: and(eq(invoice.organizationId, orgId), inArray(invoice.id, ids)),
      with: { lines: true },
    })
  );
}

/** Fires for the given invoices that are now fully paid. */
export function emitInvoicePaid(orgId: string, invoiceIds: (string | null | undefined)[]) {
  const ids = unique(invoiceIds);
  if (ids.length === 0) return;
  queueWebhookEvent(orgId, "invoice.paid", () =>
    db.query.invoice.findMany({
      where: and(
        eq(invoice.organizationId, orgId),
        inArray(invoice.id, ids),
        eq(invoice.status, "paid")
      ),
    })
  );
}

export function emitInvoiceOverdue(orgId: string, invoiceIds: (string | null | undefined)[]) {
  const ids = unique(invoiceIds);
  if (ids.length === 0) return;
  queueWebhookEvent(orgId, "invoice.overdue", () =>
    db.query.invoice.findMany({
      where: and(
        eq(invoice.organizationId, orgId),
        inArray(invoice.id, ids),
        eq(invoice.status, "overdue")
      ),
    })
  );
}

/**
 * Money received from a customer (payment.received), plus invoice.paid for any
 * invoice the payment settled in full. Bill payments (money out) send nothing.
 */
export function emitPaymentReceived(orgId: string, paymentIds: (string | null | undefined)[]) {
  const ids = unique(paymentIds);
  if (ids.length === 0) return;
  queueWebhookEvent(orgId, "payment.received", async () => {
    const rows = await db.query.payment.findMany({
      where: and(
        eq(payment.organizationId, orgId),
        inArray(payment.id, ids),
        eq(payment.type, "received")
      ),
      with: { allocations: true },
    });
    return rows;
  });
  emitInvoicePaidForPayments(orgId, ids);
}

function emitInvoicePaidForPayments(orgId: string, paymentIds: string[]) {
  queueWebhookEvent(orgId, "invoice.paid", async () => {
    const allocations = await db
      .select({ documentId: paymentAllocation.documentId })
      .from(paymentAllocation)
      .innerJoin(payment, eq(payment.id, paymentAllocation.paymentId))
      .where(
        and(
          eq(payment.organizationId, orgId),
          inArray(paymentAllocation.paymentId, paymentIds),
          eq(paymentAllocation.documentType, "invoice")
        )
      );
    const invoiceIds = unique(allocations.map((a) => a.documentId));
    if (invoiceIds.length === 0) return [];
    return db.query.invoice.findMany({
      where: and(
        eq(invoice.organizationId, orgId),
        inArray(invoice.id, invoiceIds),
        eq(invoice.status, "paid")
      ),
    });
  });
}

export function emitBillCreated(orgId: string, billIds: (string | null | undefined)[]) {
  const ids = unique(billIds);
  if (ids.length === 0) return;
  queueWebhookEvent(orgId, "bill.created", () =>
    db.query.bill.findMany({
      where: and(eq(bill.organizationId, orgId), inArray(bill.id, ids)),
      with: { lines: true },
    })
  );
}

export function emitBillDue(orgId: string, billIds: (string | null | undefined)[]) {
  const ids = unique(billIds);
  if (ids.length === 0) return;
  queueWebhookEvent(orgId, "bill.due", () =>
    db.query.bill.findMany({
      where: and(eq(bill.organizationId, orgId), inArray(bill.id, ids)),
    })
  );
}

export function emitExpenseCreated(orgId: string, expenseIds: (string | null | undefined)[]) {
  const ids = unique(expenseIds);
  if (ids.length === 0) return;
  queueWebhookEvent(orgId, "expense.created", () =>
    db.query.expenseClaim.findMany({
      where: and(eq(expenseClaim.organizationId, orgId), inArray(expenseClaim.id, ids)),
      with: { items: true },
    })
  );
}

export function emitContactCreated(orgId: string, contactIds: (string | null | undefined)[]) {
  const ids = unique(contactIds);
  if (ids.length === 0) return;
  queueWebhookEvent(orgId, "contact.created", () =>
    db.query.contact.findMany({
      where: and(eq(contact.organizationId, orgId), inArray(contact.id, ids)),
    })
  );
}

/**
 * journal.posted for an entry, by id or by its entry number (the number is
 * known before the row is inserted, which lets the shared numbering helper
 * cover every posting path). Only entries that ended up posted are sent.
 */
export function emitJournalPosted(
  orgId: string,
  entry: { id: string } | { entryNumber: number }
) {
  queueWebhookEvent(orgId, "journal.posted", () =>
    db.query.journalEntry.findMany({
      where: and(
        eq(journalEntry.organizationId, orgId),
        "id" in entry
          ? eq(journalEntry.id, entry.id)
          : eq(journalEntry.entryNumber, entry.entryNumber),
        eq(journalEntry.status, "posted")
      ),
      with: { lines: true },
    })
  );
}

export function emitApprovalRequested(orgId: string, requestId: string) {
  queueWebhookEvent(orgId, "approval.requested", () =>
    db.query.approvalRequest.findMany({
      where: and(
        eq(approvalRequest.organizationId, orgId),
        eq(approvalRequest.id, requestId),
        eq(approvalRequest.status, "pending")
      ),
    })
  );
}

/** Fires once a request is decided: approved or rejected. */
export function emitApprovalCompleted(orgId: string, requestId: string) {
  queueWebhookEvent(orgId, "approval.completed", () =>
    db.query.approvalRequest.findMany({
      where: and(
        eq(approvalRequest.organizationId, orgId),
        eq(approvalRequest.id, requestId),
        inArray(approvalRequest.status, ["approved", "rejected"])
      ),
    })
  );
}
