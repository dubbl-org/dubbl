import { db } from "@/lib/db";
import {
  invoice,
  invoiceLine,
  member,
  project,
  projectBillableItem,
  projectMember,
  projectMilestone,
  timeEntry,
} from "@/lib/db/schema";
import { and, eq, inArray, isNotNull, isNull, ne, or, sql } from "drizzle-orm";

type DbOrTx = typeof db | Parameters<Parameters<(typeof db)["transaction"]>[0]>[0];

/** What a project-generated invoice line bills (invoice_line.project_billing_kind). */
export type ProjectBillingKind = "time" | "expense" | "milestone" | "fixed";

/**
 * Invoice statuses that count as billed to the client. Drafts and invoices
 * waiting for (or refused) approval still hold the work so it can't be billed
 * twice, but they don't count toward "Total billed" until they are issued.
 */
export const ISSUED_INVOICE_STATUSES = ["sent", "partial", "paid", "overdue"] as const;

/** An invoice that no longer holds project work: voided or deleted. */
function deadInvoiceIds(exec: DbOrTx, organizationId: string) {
  return exec
    .select({ id: invoice.id })
    .from(invoice)
    .where(
      and(
        eq(invoice.organizationId, organizationId),
        or(eq(invoice.status, "void"), isNotNull(invoice.deletedAt))
      )
    );
}

export interface ProjectBillingTotals {
  totalHours: number; // minutes
  totalBilled: number; // cents on issued invoices
  unissuedBilled: number; // cents on draft / awaiting-approval invoices
}

/**
 * Bring a project's billing state in line with its invoices, wherever they were
 * changed (invoice pages, bulk actions, MCP, Stripe sync...):
 * - time entries and billable expenses on a voided or deleted invoice are
 *   released so they can be billed again;
 * - each milestone's invoiced amount is re-derived from the live invoice lines
 *   that bill it;
 * - project.totalHours and project.totalBilled are re-derived from the time
 *   entries and from the issued invoice lines tagged with the project.
 * Cheap enough to run before every project read; only rows that drifted are
 * written. Returns the totals per project id.
 */
export async function syncProjectBilling(
  exec: DbOrTx,
  organizationId: string,
  requestedIds: string[]
): Promise<Map<string, ProjectBillingTotals>> {
  const totals = new Map<string, ProjectBillingTotals>();
  if (requestedIds.length === 0) return totals;

  // Only ever touch this organization's projects.
  const projects = await exec
    .select({ id: project.id, totalHours: project.totalHours, totalBilled: project.totalBilled })
    .from(project)
    .where(and(eq(project.organizationId, organizationId), inArray(project.id, requestedIds)));
  const projectIds = projects.map((p) => p.id);
  if (projectIds.length === 0) return totals;

  await exec
    .update(timeEntry)
    .set({ invoiceId: null })
    .where(
      and(
        inArray(timeEntry.projectId, projectIds),
        inArray(timeEntry.invoiceId, deadInvoiceIds(exec, organizationId))
      )
    );

  await exec
    .update(projectBillableItem)
    .set({ billedInvoiceId: null, billedAmount: 0, billedAt: null })
    .where(
      and(
        eq(projectBillableItem.organizationId, organizationId),
        inArray(projectBillableItem.projectId, projectIds),
        inArray(projectBillableItem.billedInvoiceId, deadInvoiceIds(exec, organizationId))
      )
    );

  // Milestones: invoiced = live (not void, not deleted) lines that bill them.
  const milestones = await exec
    .select({ id: projectMilestone.id, invoiced: projectMilestone.invoicedAmountCents })
    .from(projectMilestone)
    .where(inArray(projectMilestone.projectId, projectIds));
  if (milestones.length > 0) {
    const sums = await exec
      .select({
        milestoneId: invoiceLine.projectMilestoneId,
        amount: sql<number>`COALESCE(SUM(${invoiceLine.amount}), 0)`.mapWith(Number),
      })
      .from(invoiceLine)
      .innerJoin(invoice, eq(invoiceLine.invoiceId, invoice.id))
      .where(
        and(
          eq(invoice.organizationId, organizationId),
          inArray(invoiceLine.projectMilestoneId, milestones.map((m) => m.id)),
          ne(invoice.status, "void"),
          isNull(invoice.deletedAt)
        )
      )
      .groupBy(invoiceLine.projectMilestoneId);
    const byMilestone = new Map(sums.map((s) => [s.milestoneId as string, s.amount]));
    for (const m of milestones) {
      const invoiced = byMilestone.get(m.id) ?? 0;
      if (invoiced !== m.invoiced) {
        await exec
          .update(projectMilestone)
          .set({ invoicedAmountCents: invoiced })
          .where(eq(projectMilestone.id, m.id));
      }
    }
  }

  const minuteRows = await exec
    .select({
      projectId: timeEntry.projectId,
      minutes: sql<number>`COALESCE(SUM(${timeEntry.minutes}), 0)`.mapWith(Number),
    })
    .from(timeEntry)
    .where(inArray(timeEntry.projectId, projectIds))
    .groupBy(timeEntry.projectId);
  const minutesBy = new Map(minuteRows.map((r) => [r.projectId, r.minutes]));

  const billedRows = await exec
    .select({
      projectId: invoiceLine.projectId,
      issued: sql<number>`COALESCE(SUM(CASE WHEN ${inArray(invoice.status, [...ISSUED_INVOICE_STATUSES])} THEN ${invoiceLine.amount} ELSE 0 END), 0)`.mapWith(Number),
      unissued: sql<number>`COALESCE(SUM(CASE WHEN ${inArray(invoice.status, [...ISSUED_INVOICE_STATUSES])} THEN 0 ELSE ${invoiceLine.amount} END), 0)`.mapWith(Number),
    })
    .from(invoiceLine)
    .innerJoin(invoice, eq(invoiceLine.invoiceId, invoice.id))
    .where(
      and(
        eq(invoice.organizationId, organizationId),
        inArray(invoiceLine.projectId, projectIds),
        ne(invoice.status, "void"),
        isNull(invoice.deletedAt)
      )
    )
    .groupBy(invoiceLine.projectId);
  const billedBy = new Map(billedRows.map((r) => [r.projectId as string, r]));

  for (const p of projects) {
    const t: ProjectBillingTotals = {
      totalHours: minutesBy.get(p.id) ?? 0,
      totalBilled: billedBy.get(p.id)?.issued ?? 0,
      unissuedBilled: billedBy.get(p.id)?.unissued ?? 0,
    };
    totals.set(p.id, t);
    if (t.totalHours !== p.totalHours || t.totalBilled !== p.totalBilled) {
      await exec
        .update(project)
        .set({ totalHours: t.totalHours, totalBilled: t.totalBilled })
        .where(eq(project.id, p.id));
    }
  }

  return totals;
}

/**
 * Cents of a fixed-price project already invoiced: its "fixed" progress lines on
 * invoices that are not voided or deleted (drafts included, so the same share
 * can't be invoiced twice).
 */
export async function getFixedPriceInvoiced(
  exec: DbOrTx,
  organizationId: string,
  projectId: string
): Promise<number> {
  const [row] = await exec
    .select({ amount: sql<number>`COALESCE(SUM(${invoiceLine.amount}), 0)`.mapWith(Number) })
    .from(invoiceLine)
    .innerJoin(invoice, eq(invoiceLine.invoiceId, invoice.id))
    .where(
      and(
        eq(invoice.organizationId, organizationId),
        eq(invoiceLine.projectId, projectId),
        eq(invoiceLine.projectBillingKind, "fixed"),
        ne(invoice.status, "void"),
        isNull(invoice.deletedAt)
      )
    );
  return row?.amount ?? 0;
}

/** Billed amount for a cost line = cost grossed up by the markup (basis points). */
export function withMarkup(cost: number, markupBasisPoints: number): number {
  return Math.round(cost * (1 + markupBasisPoints / 10000));
}

/**
 * Billing rate (cents/hour) for new time on a project: the person's project
 * member rate when set, otherwise the project's hourly rate.
 */
export async function resolveTimeEntryRate(
  exec: DbOrTx,
  proj: { id: string; hourlyRate: number },
  userId: string
): Promise<number> {
  const [row] = await exec
    .select({ hourlyRate: projectMember.hourlyRate })
    .from(projectMember)
    .innerJoin(member, eq(projectMember.memberId, member.id))
    .where(and(eq(projectMember.projectId, proj.id), eq(member.userId, userId)))
    .limit(1);
  return row?.hourlyRate ?? proj.hourlyRate;
}
