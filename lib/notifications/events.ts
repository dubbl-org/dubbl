import { db } from "@/lib/db";
import {
  approvalRequest,
  approvalWorkflowStep,
  bill,
  expenseClaim,
  inventoryItem,
  invoice,
  journalEntry,
  member,
  notification,
  payment,
  paymentAllocation,
  payrollRun,
  purchaseOrder,
  users,
} from "@/lib/db/schema";
import { and, asc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { formatMoney } from "@/lib/money";
import { sendNotification } from "./send";

/**
 * The events that raise notifications. Each one picks who should hear about
 * it, skips whoever caused it, and doesn't repeat itself. Every user's own
 * preferences (inbox and email per type) are applied by sendNotification and
 * the inbox query.
 *
 * Hooks call these after their own work is saved and never wait on them to
 * succeed: a notification that fails to send must not fail the action.
 */

type NotifyParams = Omit<Parameters<typeof sendNotification>[0], "userId">;

/** Run a notification hook without letting it throw into the caller. */
export function notifySafely(work: Promise<unknown>) {
  return work.catch((err) => console.error("Notification hook failed:", err));
}

/** Owners and admins of the organization. */
async function orgAdminUserIds(orgId: string) {
  const rows = await db.query.member.findMany({
    where: and(eq(member.organizationId, orgId), inArray(member.role, ["owner", "admin"])),
    columns: { userId: true },
  });
  return rows.map((r) => r.userId);
}

async function memberUserId(memberId: string) {
  const row = await db.query.member.findFirst({ where: eq(member.id, memberId), columns: { userId: true } });
  return row?.userId ?? null;
}

/** Already told this user about this record (and it's still in their inbox, or recent)? */
async function alreadyNotified(
  orgId: string,
  userId: string,
  type: NotifyParams["type"],
  entityId: string,
  opts: { sinceDays?: number } = {}
) {
  const conditions = [
    eq(notification.organizationId, orgId),
    eq(notification.userId, userId),
    eq(notification.type, type),
    eq(notification.entityId, entityId),
  ];
  if (opts.sinceDays !== undefined) {
    conditions.push(gte(notification.createdAt, new Date(Date.now() - opts.sinceDays * 86_400_000)));
  }
  const found = await db.query.notification.findFirst({ where: and(...conditions), columns: { id: true } });
  return Boolean(found);
}

/** Send to each user once, leaving out the one who caused the event. */
async function notifyUsers(
  userIds: (string | null | undefined)[],
  params: NotifyParams,
  opts: { exclude?: string | null; dedupe?: boolean; sinceDays?: number } = {}
) {
  let sent = 0;
  const unique = [...new Set(userIds.filter((u): u is string => Boolean(u)))];
  for (const userId of unique) {
    if (opts.exclude && userId === opts.exclude) continue;
    if (opts.dedupe && params.entityId && (await alreadyNotified(params.orgId, userId, params.type, params.entityId, { sinceDays: opts.sinceDays }))) {
      continue;
    }
    try {
      await sendNotification({ ...params, userId });
      sent++;
    } catch (err) {
      console.error(`Failed to notify user ${userId}:`, err);
    }
  }
  return sent;
}

/* ------------------------------------------------------------------ */
/*  Payment received                                                   */
/* ------------------------------------------------------------------ */

/**
 * A customer payment was recorded against one or more invoices. Tells the
 * owners/admins and whoever created the invoice, except the person who
 * recorded it. Does nothing for supplier payments or unallocated money.
 */
export async function notifyPaymentReceived(orgId: string, paymentId: string, actorUserId?: string | null) {
  const pay = await db.query.payment.findFirst({
    where: and(eq(payment.id, paymentId), eq(payment.organizationId, orgId)),
    with: { contact: { columns: { name: true } } },
  });
  if (!pay || pay.type !== "received") return 0;

  const allocations = await db
    .select({ documentId: paymentAllocation.documentId })
    .from(paymentAllocation)
    .where(and(eq(paymentAllocation.paymentId, paymentId), eq(paymentAllocation.documentType, "invoice")));
  if (allocations.length === 0) return 0;

  const invoices = await db.query.invoice.findMany({
    where: and(eq(invoice.organizationId, orgId), inArray(invoice.id, allocations.map((a) => a.documentId))),
    columns: { id: true, invoiceNumber: true, status: true, createdBy: true },
  });
  if (invoices.length === 0) return 0;

  const amount = formatMoney(pay.amount, pay.currencyCode);
  const from = pay.contact?.name ? ` from ${pay.contact.name}` : "";
  const single = invoices.length === 1 ? invoices[0] : null;
  const title = single ? `Payment received for ${single.invoiceNumber}` : `Payment received${from}`;
  const body = single
    ? `${amount}${from}. ${single.status === "paid" ? `${single.invoiceNumber} is now paid in full.` : `${single.invoiceNumber} is partly paid.`}`
    : `${amount} across ${invoices.map((i) => i.invoiceNumber).join(", ")}.`;

  const recipients = [...(await orgAdminUserIds(orgId)), ...invoices.map((i) => i.createdBy)];
  return notifyUsers(
    recipients,
    { orgId, type: "payment_received", title, body, ...(single ? { entityType: "invoice", entityId: single.id } : {}) },
    { exclude: actorUserId }
  );
}

/* ------------------------------------------------------------------ */
/*  Invoice overdue                                                    */
/* ------------------------------------------------------------------ */

/** Invoices that just went overdue. Each invoice is announced once. */
export async function notifyInvoicesOverdue(invoiceIds: string[]) {
  if (invoiceIds.length === 0) return 0;
  const rows = await db.query.invoice.findMany({
    where: inArray(invoice.id, invoiceIds),
    columns: { id: true, organizationId: true, invoiceNumber: true, dueDate: true, amountDue: true, currencyCode: true, createdBy: true },
    with: { contact: { columns: { name: true } } },
  });

  const adminsByOrg = new Map<string, string[]>();
  let sent = 0;
  for (const inv of rows) {
    if (!adminsByOrg.has(inv.organizationId)) adminsByOrg.set(inv.organizationId, await orgAdminUserIds(inv.organizationId));
    sent += await notifyUsers(
      [...adminsByOrg.get(inv.organizationId)!, inv.createdBy],
      {
        orgId: inv.organizationId,
        type: "invoice_overdue",
        title: `${inv.invoiceNumber} is overdue`,
        body: `${formatMoney(inv.amountDue, inv.currencyCode)}${inv.contact?.name ? ` from ${inv.contact.name}` : ""} was due ${inv.dueDate}.`,
        entityType: "invoice",
        entityId: inv.id,
      },
      { dedupe: true }
    );
  }
  return sent;
}

/* ------------------------------------------------------------------ */
/*  Approval needed                                                    */
/* ------------------------------------------------------------------ */

const APPROVAL_LABELS: Record<string, string> = {
  bill: "Bill",
  expense: "Expense claim",
  invoice: "Invoice",
  journal_entry: "Journal entry",
  purchase_order: "Purchase order",
};

async function approvalSubject(entityType: string, entityId: string): Promise<string | null> {
  switch (entityType) {
    case "invoice":
      return (await db.query.invoice.findFirst({ where: eq(invoice.id, entityId), columns: { invoiceNumber: true } }))?.invoiceNumber ?? null;
    case "bill":
      return (await db.query.bill.findFirst({ where: eq(bill.id, entityId), columns: { billNumber: true } }))?.billNumber ?? null;
    case "purchase_order":
      return (await db.query.purchaseOrder.findFirst({ where: eq(purchaseOrder.id, entityId), columns: { poNumber: true } }))?.poNumber ?? null;
    case "journal_entry": {
      const je = await db.query.journalEntry.findFirst({ where: eq(journalEntry.id, entityId), columns: { entryNumber: true } });
      return je ? `JE-${je.entryNumber}` : null;
    }
    case "expense":
      return (await db.query.expenseClaim.findFirst({ where: eq(expenseClaim.id, entityId), columns: { title: true } }))?.title ?? null;
    default:
      return null;
  }
}

/**
 * Tell the approver of a pending request's current step that it's their turn.
 * Call after a request is created and after it moves to the next step.
 */
export async function notifyApprovalStep(requestId: string) {
  const req = await db.query.approvalRequest.findFirst({ where: eq(approvalRequest.id, requestId) });
  if (!req || req.status !== "pending") return 0;

  const step = await db.query.approvalWorkflowStep.findFirst({
    where: and(eq(approvalWorkflowStep.workflowId, req.workflowId), eq(approvalWorkflowStep.stepOrder, req.currentStepOrder)),
    orderBy: asc(approvalWorkflowStep.stepOrder),
  });
  if (!step) return 0;

  const [approver, requester] = await Promise.all([memberUserId(step.approverId), memberUserId(req.requestedById)]);
  if (!approver) return 0;

  const label = APPROVAL_LABELS[req.entityType] ?? "Item";
  const subject = await approvalSubject(req.entityType, req.entityId);
  const requesterUser = requester
    ? await db.query.users.findFirst({ where: eq(users.id, requester), columns: { name: true, email: true } })
    : null;

  return notifyUsers(
    [approver],
    {
      orgId: req.organizationId,
      type: "approval_needed",
      title: `${label}${subject ? ` ${subject}` : ""} needs your approval`,
      body: requesterUser ? `Sent by ${requesterUser.name || requesterUser.email}.` : undefined,
      entityType: req.entityType,
      entityId: req.entityId,
    },
    // Whoever sent it in already knows, even when they're the approver too
    { exclude: requester }
  );
}

/* ------------------------------------------------------------------ */
/*  Task assigned                                                      */
/* ------------------------------------------------------------------ */

/** A project task was given to someone (assigneeId is a member id). */
export async function notifyTaskAssigned(
  orgId: string,
  task: { id: string; title: string; projectId: string; assigneeId: string | null; dueDate?: string | null },
  projectName: string,
  actorUserId?: string | null
) {
  if (!task.assigneeId) return 0;
  const assignee = await db.query.member.findFirst({
    where: and(eq(member.id, task.assigneeId), eq(member.organizationId, orgId)),
    columns: { userId: true },
  });
  if (!assignee) return 0;
  return notifyUsers(
    [assignee.userId],
    {
      orgId,
      type: "task_assigned",
      title: `New task: ${task.title}`,
      body: `In ${projectName}${task.dueDate ? `, due ${task.dueDate}` : ""}.`,
      entityType: "project",
      entityId: task.projectId,
    },
    { exclude: actorUserId }
  );
}

/* ------------------------------------------------------------------ */
/*  Payroll due                                                        */
/* ------------------------------------------------------------------ */

/** Days before a pay period ends that an unprocessed run starts to nag. */
export const PAYROLL_DUE_DAYS = 3;

/**
 * Daily: pay runs that are still draft or waiting for approval and whose pay
 * period ends within the next few days (or already ended). One notice per run.
 */
export async function checkPayrollDue() {
  const today = new Date();
  const horizon = new Date(today.getTime() + PAYROLL_DUE_DAYS * 86_400_000).toISOString().slice(0, 10);
  const runs = await db.query.payrollRun.findMany({
    where: and(
      inArray(payrollRun.status, ["draft", "pending_approval"]),
      isNull(payrollRun.deletedAt),
      lte(payrollRun.payPeriodEnd, horizon)
    ),
    columns: { id: true, organizationId: true, payPeriodStart: true, payPeriodEnd: true, status: true, totalNet: true },
  });

  let sent = 0;
  for (const run of runs) {
    const admins = await orgAdminUserIds(run.organizationId);
    const ended = run.payPeriodEnd < today.toISOString().slice(0, 10);
    sent += await notifyUsers(
      admins,
      {
        orgId: run.organizationId,
        type: "payroll_due",
        title: ended ? `Pay run for ${run.payPeriodStart} to ${run.payPeriodEnd} hasn't been processed` : `Pay run due by ${run.payPeriodEnd}`,
        body: run.status === "pending_approval" ? "It's waiting for approval." : "It's still a draft. Review and process it so people are paid on time.",
        entityType: "payroll_run",
        entityId: run.id,
      },
      { dedupe: true }
    );
  }
  return { checked: runs.length, alerted: sent };
}

/* ------------------------------------------------------------------ */
/*  Low stock                                                          */
/* ------------------------------------------------------------------ */

/** How long before the same item can raise another low stock notice. */
const LOW_STOCK_REPEAT_DAYS = 7;

/**
 * Daily: active items with a reorder point whose stock is at or below it.
 * One notice per item a week while it stays low.
 */
export async function checkLowInventory() {
  const items = await db.query.inventoryItem.findMany({
    where: and(
      eq(inventoryItem.isActive, true),
      isNull(inventoryItem.deletedAt),
      sql`${inventoryItem.reorderPoint} > 0`,
      sql`${inventoryItem.quantityOnHand} <= ${inventoryItem.reorderPoint}`
    ),
    columns: { id: true, organizationId: true, name: true, sku: true, quantityOnHand: true, reorderPoint: true },
  });

  const adminsByOrg = new Map<string, string[]>();
  let sent = 0;
  for (const item of items) {
    if (!adminsByOrg.has(item.organizationId)) adminsByOrg.set(item.organizationId, await orgAdminUserIds(item.organizationId));
    sent += await notifyUsers(
      adminsByOrg.get(item.organizationId)!,
      {
        orgId: item.organizationId,
        type: "inventory_low",
        title: `Low stock: ${item.name}${item.sku ? ` (${item.sku})` : ""}`,
        body: `${item.quantityOnHand} on hand, reorder point is ${item.reorderPoint}.`,
        entityType: "inventory_item",
        entityId: item.id,
      },
      { dedupe: true, sinceDays: LOW_STOCK_REPEAT_DAYS }
    );
  }
  return { checked: items.length, alerted: sent };
}

/* ------------------------------------------------------------------ */
/*  System                                                             */
/* ------------------------------------------------------------------ */

/**
 * Something that runs on its own failed (a scheduled backup, a scheduled
 * report, payment reminders). Goes to the given users, or the owners/admins.
 * Repeats at most once a day per subject.
 */
export async function notifySystemAlert(
  orgId: string,
  alert: { title: string; body?: string; entityType?: string; entityId?: string },
  userIds?: (string | null | undefined)[]
) {
  const recipients = userIds?.some(Boolean) ? userIds : await orgAdminUserIds(orgId);
  const since = new Date(Date.now() - 86_400_000);
  let sent = 0;
  for (const userId of new Set(recipients.filter((u): u is string => Boolean(u)))) {
    const recent = await db.query.notification.findFirst({
      where: and(
        eq(notification.organizationId, orgId),
        eq(notification.userId, userId),
        eq(notification.type, "system_alert"),
        eq(notification.title, alert.title),
        gte(notification.createdAt, since)
      ),
      columns: { id: true },
    });
    if (recent) continue;
    try {
      await sendNotification({ orgId, userId, type: "system_alert", ...alert });
      sent++;
    } catch (err) {
      console.error(`Failed to notify user ${userId}:`, err);
    }
  }
  return sent;
}

/** Daily checks for date and stock based notifications (see trigger/scheduled.ts). */
export async function processNotificationChecks() {
  const payrollDue = await checkPayrollDue();
  const lowInventory = await checkLowInventory();
  return { payrollDue, lowInventory };
}
