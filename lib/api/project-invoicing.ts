import { db } from "@/lib/db";
import {
  contact,
  invoice,
  invoiceLine,
  project,
  projectBillableItem,
  projectMilestone,
  timeEntry,
} from "@/lib/db/schema";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { getNextNumber } from "@/lib/api/numbering";
import type { AuthContext } from "@/lib/api/auth-context";
import { ProjectError, type ProjectRecord } from "@/lib/api/project-access";
import {
  getFixedPriceInvoiced,
  syncProjectBilling,
  withMarkup,
  type ProjectBillingKind,
} from "@/lib/api/project-billing";
import { fixedPriceInvoiceAmount, localISODate, projectInvoiceRevenueAccount, withLineAccount } from "@/lib/projects/rules";
import { ensureAccountForCode } from "@/lib/api/account-roles";
import { getBaseCurrency } from "@/lib/api/payment-bank-account";
import { emitInvoiceCreated } from "@/lib/webhooks/events";

/** The standard Sales account project work posts to when the client has no default. */
const SALES_ACCOUNT = { code: "4000", name: "Sales Revenue", type: "revenue" as const, subType: "operating" };

export interface ProjectInvoiceInput {
  /** Milestone billing: milestones to invoice (their remaining amount each). */
  milestoneIds?: string[];
  /** Hourly billing: specific unbilled billable time entries to invoice. */
  timeEntryIds?: string[];
  /** Hourly billing: invoice every unbilled billable time entry. */
  allUnbilledTime?: boolean;
  /** Fixed price billing: percent (0-100) of the fixed price to invoice. */
  percentageToInvoice?: number;
  /** Add registered, not-yet-billed billable expenses (any billing type). */
  includeBillableExpenses?: boolean;
  /** Only these billable expenses (when includeBillableExpenses is on). */
  billableItemIds?: string[];
  /** Markup (basis points) for expenses whose own markup is 0. */
  defaultExpenseMarkupBasisPoints?: number;
  contactId?: string;
  issueDate?: string;
  dueDate?: string;
  notes?: string | null;
}

interface DraftLine {
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  kind: ProjectBillingKind;
  milestoneId?: string;
}

/**
 * Create a draft invoice for a project's work, following its billing type:
 * hourly bills time entries, milestone bills milestones, fixed bills a share of
 * the fixed price; billable expenses can be added to any of them. Non-billable
 * projects can't be invoiced. Lines are tagged with the project (and what they
 * bill) so "already invoiced" amounts come from live invoices: voiding or
 * deleting the invoice releases the work again (see syncProjectBilling).
 * Everything happens in one transaction with the project row locked, so two
 * requests can't bill the same work twice. Amounts are integer cents.
 */
export async function createProjectInvoice(
  ctx: AuthContext,
  proj: ProjectRecord,
  input: ProjectInvoiceInput
) {
  if (proj.billingType === "non_billable") {
    throw new ProjectError("This project is non-billable. Change its billing type in Settings to invoice it.", 400);
  }
  const contactId = input.contactId || proj.contactId;
  if (!contactId) {
    throw new ProjectError("Set a client on the project (Settings) before invoicing it", 400);
  }
  const client = await db.query.contact.findFirst({
    where: and(eq(contact.id, contactId), eq(contact.organizationId, ctx.organizationId)),
    columns: { id: true, defaultRevenueAccountId: true },
  });
  if (!client) throw new ProjectError("Contact not found", 404);
  const baseCurrency = client.defaultRevenueAccountId ? null : await getBaseCurrency(ctx.organizationId);

  // Release work from voided/deleted invoices before deciding what is unbilled.
  await syncProjectBilling(db, ctx.organizationId, [proj.id]);

  const today = localISODate();
  const due = new Date();
  due.setDate(due.getDate() + 30);
  const issueDate = input.issueDate || today;
  const dueDate = input.dueDate || localISODate(due);

  return db.transaction(async (tx) => {
    // Serialize invoicing per project.
    await tx.select({ id: project.id }).from(project).where(eq(project.id, proj.id)).for("update");

    const lines: DraftLine[] = [];
    let entryIds: string[] = [];
    const milestoneUpdates: { id: string; invoiced: number }[] = [];
    const billedUpdates: { id: string; billedAmount: number }[] = [];

    if (proj.billingType === "milestone" && input.milestoneIds?.length) {
      const milestones = await tx
        .select()
        .from(projectMilestone)
        .where(and(eq(projectMilestone.projectId, proj.id), inArray(projectMilestone.id, input.milestoneIds)));
      for (const m of milestones) {
        const remaining = m.amount - m.invoicedAmountCents;
        if (remaining <= 0) continue;
        lines.push({
          description: `Milestone: ${m.title}`,
          quantity: 100, // 1.00
          unitPrice: remaining,
          amount: remaining,
          kind: "milestone",
          milestoneId: m.id,
        });
        milestoneUpdates.push({ id: m.id, invoiced: m.amount });
      }
    } else if (proj.billingType === "hourly" && (input.allUnbilledTime || input.timeEntryIds?.length)) {
      const entries = await tx
        .select()
        .from(timeEntry)
        .where(
          and(
            eq(timeEntry.projectId, proj.id),
            eq(timeEntry.isBillable, true),
            isNull(timeEntry.invoiceId),
            input.allUnbilledTime ? undefined : inArray(timeEntry.id, input.timeEntryIds!)
          )
        );
      entries.sort((a, b) => a.date.localeCompare(b.date));
      for (const te of entries) {
        const hours = te.minutes / 60;
        const rate = te.hourlyRate || proj.hourlyRate;
        lines.push({
          description: te.description || `Time entry: ${hours.toFixed(2)} hrs`,
          quantity: Math.round(hours * 100), // hours as 2-decimal int
          unitPrice: rate,
          amount: Math.round(hours * rate),
          kind: "time",
        });
      }
      entryIds = entries.map((e) => e.id);
    } else if (proj.billingType === "fixed" && input.percentageToInvoice) {
      const alreadyInvoiced = await getFixedPriceInvoiced(tx, ctx.organizationId, proj.id);
      const pct = Math.min(100, Math.max(0, input.percentageToInvoice));
      const amount = fixedPriceInvoiceAmount(proj.fixedPrice, alreadyInvoiced, pct);
      if (amount <= 0) {
        throw new ProjectError("The fixed price has already been fully invoiced", 400);
      }
      // Describe the share actually billed (the request is capped at what is left).
      const billedPct = proj.fixedPrice > 0 ? Math.round((amount / proj.fixedPrice) * 10000) / 100 : pct;
      lines.push({
        description: `${proj.name} - ${billedPct}% of fixed price`,
        quantity: 100, // 1.00
        unitPrice: amount,
        amount,
        kind: "fixed",
      });
    }

    if (input.includeBillableExpenses) {
      const items = await tx
        .select()
        .from(projectBillableItem)
        .where(
          and(
            eq(projectBillableItem.organizationId, ctx.organizationId),
            eq(projectBillableItem.projectId, proj.id),
            isNull(projectBillableItem.billedInvoiceId),
            input.billableItemIds?.length ? inArray(projectBillableItem.id, input.billableItemIds) : undefined
          )
        );
      for (const item of items) {
        // The item's own markup wins; fall back to the request default when it's 0.
        const markup = item.markupBasisPoints > 0 ? item.markupBasisPoints : input.defaultExpenseMarkupBasisPoints ?? 0;
        const amount = withMarkup(item.costAmount, markup);
        lines.push({ description: item.description, quantity: 100, unitPrice: amount, amount, kind: "expense" });
        billedUpdates.push({ id: item.id, billedAmount: amount });
      }
    }

    if (lines.length === 0) {
      throw new ProjectError("Nothing to invoice: select unbilled work or billable expenses", 400);
    }

    // Every line posts to an income account when the invoice is sent.
    const salesAccountId = baseCurrency
      ? (await ensureAccountForCode(ctx.organizationId, SALES_ACCOUNT, baseCurrency, tx))?.id
      : null;
    const accountId = projectInvoiceRevenueAccount(client.defaultRevenueAccountId, salesAccountId);
    if (!accountId) {
      throw new ProjectError("No income account found. Add a Sales account to your chart of accounts first.", 400);
    }

    const subtotal = lines.reduce((s, l) => s + l.amount, 0);
    const invoiceNumber = await getNextNumber(ctx.organizationId, "invoice", "invoice_number", "INV");

    const [inv] = await tx
      .insert(invoice)
      .values({
        organizationId: ctx.organizationId,
        contactId,
        invoiceNumber,
        issueDate,
        dueDate,
        status: "draft",
        reference: `Project: ${proj.name}`,
        notes: input.notes || null,
        subtotal,
        taxTotal: 0,
        total: subtotal,
        amountPaid: 0,
        amountDue: subtotal,
        currencyCode: proj.currency,
        createdBy: ctx.userId,
      })
      .returning();
    emitInvoiceCreated(ctx.organizationId, [inv.id]);

    await tx.insert(invoiceLine).values(
      withLineAccount(lines, accountId).map((l, i) => ({
        invoiceId: inv.id,
        description: l.description,
        accountId: l.accountId,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        taxAmount: 0,
        amount: l.amount,
        projectId: proj.id,
        projectBillingKind: l.kind,
        projectMilestoneId: l.milestoneId ?? null,
        sortOrder: i,
      }))
    );

    if (entryIds.length > 0) {
      const marked = await tx
        .update(timeEntry)
        .set({ invoiceId: inv.id })
        .where(and(inArray(timeEntry.id, entryIds), isNull(timeEntry.invoiceId)))
        .returning({ id: timeEntry.id });
      if (marked.length !== entryIds.length) {
        throw new ProjectError("Some of this time was invoiced at the same moment. Try again.", 409);
      }
    }

    for (const m of milestoneUpdates) {
      await tx.update(projectMilestone).set({ invoicedAmountCents: m.invoiced }).where(eq(projectMilestone.id, m.id));
    }

    const now = new Date();
    for (const upd of billedUpdates) {
      const marked = await tx
        .update(projectBillableItem)
        .set({ billedInvoiceId: inv.id, billedAmount: upd.billedAmount, billedAt: now })
        .where(and(eq(projectBillableItem.id, upd.id), isNull(projectBillableItem.billedInvoiceId)))
        .returning({ id: projectBillableItem.id });
      if (marked.length !== 1) {
        throw new ProjectError("A billable expense was invoiced at the same moment. Try again.", 409);
      }
    }

    await tx.update(project).set({ updatedAt: now }).where(eq(project.id, proj.id));

    return { ...inv, lineCount: lines.length };
  });
}

/**
 * What can still be invoiced on a project, by billing type. Amounts in cents,
 * minutes for time. Runs syncProjectBilling first so voided/deleted invoices
 * no longer count.
 */
export async function getProjectUninvoiced(ctx: AuthContext, proj: ProjectRecord) {
  await syncProjectBilling(db, ctx.organizationId, [proj.id]);

  const billableRows = await db
    .select()
    .from(projectBillableItem)
    .where(
      and(
        eq(projectBillableItem.organizationId, ctx.organizationId),
        eq(projectBillableItem.projectId, proj.id),
        isNull(projectBillableItem.billedInvoiceId)
      )
    );
  const billableExpenses = billableRows.map((i) => ({
    id: i.id,
    description: i.description,
    costAmount: i.costAmount,
    markupBasisPoints: i.markupBasisPoints,
    billableAmount: withMarkup(i.costAmount, i.markupBasisPoints),
  }));
  const billableExpensesTotal = billableExpenses.reduce((s, i) => s + i.billableAmount, 0);
  const base = { contactId: proj.contactId, currency: proj.currency, billableExpenses, billableExpensesTotal };

  if (proj.billingType === "milestone") {
    const rows = await db
      .select()
      .from(projectMilestone)
      .where(eq(projectMilestone.projectId, proj.id))
      .orderBy(projectMilestone.sortOrder, projectMilestone.createdAt);
    const milestones = rows.map((m) => ({
      id: m.id,
      title: m.title,
      status: m.status,
      dueDate: m.dueDate,
      amount: m.amount,
      invoicedAmountCents: m.invoicedAmountCents,
      remaining: Math.max(0, m.amount - m.invoicedAmountCents),
      progressPercent: m.progressPercent,
    }));
    return {
      billingType: "milestone" as const,
      ...base,
      milestones,
      totalRemaining: milestones.reduce((s, m) => s + m.remaining, 0),
    };
  }

  if (proj.billingType === "hourly") {
    const entries = await db.query.timeEntry.findMany({
      where: and(eq(timeEntry.projectId, proj.id), eq(timeEntry.isBillable, true), isNull(timeEntry.invoiceId)),
      with: { user: { columns: { id: true, name: true, email: true, image: true } }, task: true },
      orderBy: (t, { asc }) => [asc(t.date)],
    });
    const timeEntries = entries.map((e) => {
      const rate = e.hourlyRate || proj.hourlyRate;
      return {
        id: e.id,
        date: e.date,
        description: e.description,
        minutes: e.minutes,
        hourlyRate: rate,
        amount: Math.round((e.minutes / 60) * rate),
        user: e.user,
        task: e.task,
      };
    });
    return {
      billingType: "hourly" as const,
      ...base,
      timeEntries,
      totalAmount: timeEntries.reduce((s, e) => s + e.amount, 0),
    };
  }

  if (proj.billingType === "fixed") {
    const totalInvoiced = await getFixedPriceInvoiced(db, ctx.organizationId, proj.id);
    return {
      billingType: "fixed" as const,
      ...base,
      fixedPrice: proj.fixedPrice,
      totalInvoiced,
      remaining: Math.max(0, proj.fixedPrice - totalInvoiced),
      invoicedPercent: proj.fixedPrice > 0 ? Math.round((totalInvoiced / proj.fixedPrice) * 100) : 0,
    };
  }

  return { billingType: "non_billable" as const, ...base, message: "Non-billable project" };
}
