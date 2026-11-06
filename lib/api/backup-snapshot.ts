import { db } from "@/lib/db";
import {
  dataBackup,
  chartAccount,
  contact,
  invoice,
  bill,
  journalEntry,
  inventoryItem,
  bankAccount,
  expenseClaim,
  payment,
  quote,
  creditNote,
  debitNote,
  purchaseOrder,
  recurringTemplate,
  project,
  budget,
  fixedAsset,
  loan,
  taxRate,
  costCenter,
  document,
  invoiceLine,
  billLine,
  journalLine,
  quoteLine,
  creditNoteLine,
  debitNoteLine,
  purchaseOrderLine,
  expenseItem,
  paymentAllocation,
  recurringTemplateLine,
  budgetLine,
  taxComponent,
} from "@/lib/db/schema";
import { eq, and, isNull, count, sql, notInArray, type Table } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { uploadBackup, downloadBackup } from "./backup-storage";
import { logAudit } from "./audit";
import { notDeleted } from "@/lib/db/soft-delete";
import type { AuthContext } from "./auth-context";
import { BackupRestoreError } from "./backup-errors";
import { toInsertRow, deferredColumns, splitDeferred, describeRecord } from "./backup-restore";

type Tx = Parameters<Parameters<(typeof db)["transaction"]>[0]>[0];

async function buildOrgSnapshot(orgId: string) {
  const accounts = await db.query.chartAccount.findMany({
    where: and(eq(chartAccount.organizationId, orgId), notDeleted(chartAccount.deletedAt)),
  });
  const contacts = await db.query.contact.findMany({
    where: and(eq(contact.organizationId, orgId), notDeleted(contact.deletedAt)),
  });
  const invoices = await db.query.invoice.findMany({
    where: and(eq(invoice.organizationId, orgId), notDeleted(invoice.deletedAt)),
    with: { lines: true },
  });
  const bills = await db.query.bill.findMany({
    where: and(eq(bill.organizationId, orgId), notDeleted(bill.deletedAt)),
    with: { lines: true },
  });
  const journalEntries = await db.query.journalEntry.findMany({
    where: and(eq(journalEntry.organizationId, orgId), notDeleted(journalEntry.deletedAt)),
    with: { lines: true },
  });
  const products = await db.query.inventoryItem.findMany({
    where: and(eq(inventoryItem.organizationId, orgId), notDeleted(inventoryItem.deletedAt)),
  });
  const bankAccounts = await db.query.bankAccount.findMany({
    where: and(eq(bankAccount.organizationId, orgId), notDeleted(bankAccount.deletedAt)),
  });
  const expenses = await db.query.expenseClaim.findMany({
    where: and(eq(expenseClaim.organizationId, orgId), notDeleted(expenseClaim.deletedAt)),
    with: { items: true },
  });
  const payments = await db.query.payment.findMany({
    where: and(eq(payment.organizationId, orgId), notDeleted(payment.deletedAt)),
    with: { allocations: true },
  });
  const quotes = await db.query.quote.findMany({
    where: and(eq(quote.organizationId, orgId), notDeleted(quote.deletedAt)),
    with: { lines: true },
  });
  const creditNotes = await db.query.creditNote.findMany({
    where: and(eq(creditNote.organizationId, orgId), notDeleted(creditNote.deletedAt)),
    with: { lines: true },
  });
  const debitNotes = await db.query.debitNote.findMany({
    where: and(eq(debitNote.organizationId, orgId), notDeleted(debitNote.deletedAt)),
    with: { lines: true },
  });
  const purchaseOrders = await db.query.purchaseOrder.findMany({
    where: and(eq(purchaseOrder.organizationId, orgId), notDeleted(purchaseOrder.deletedAt)),
    with: { lines: true },
  });
  const recurringTemplates = await db.query.recurringTemplate.findMany({
    where: and(eq(recurringTemplate.organizationId, orgId), notDeleted(recurringTemplate.deletedAt)),
    with: { lines: true },
  });
  const projectsList = await db.query.project.findMany({
    where: and(eq(project.organizationId, orgId), notDeleted(project.deletedAt)),
  });
  const budgetsList = await db.query.budget.findMany({
    where: and(eq(budget.organizationId, orgId), notDeleted(budget.deletedAt)),
    with: { lines: true },
  });
  const fixedAssets = await db.query.fixedAsset.findMany({
    where: and(eq(fixedAsset.organizationId, orgId), notDeleted(fixedAsset.deletedAt)),
  });
  const loans = await db.query.loan.findMany({
    where: and(eq(loan.organizationId, orgId), notDeleted(loan.deletedAt)),
  });
  const taxRates = await db.query.taxRate.findMany({
    where: and(eq(taxRate.organizationId, orgId), notDeleted(taxRate.deletedAt)),
    with: { components: true },
  });
  const costCenters = await db.query.costCenter.findMany({
    where: and(eq(costCenter.organizationId, orgId), notDeleted(costCenter.deletedAt)),
  });
  const documents = await db.query.document.findMany({
    where: and(eq(document.organizationId, orgId), notDeleted(document.deletedAt)),
  });

  return {
    // 2: expenses, payments, recurring templates, budgets and tax rates also
    // carry their child rows (items, allocations, lines, components)
    version: 2,
    createdAt: new Date().toISOString(),
    organizationId: orgId,
    entities: {
      accounts,
      contacts,
      invoices,
      bills,
      journalEntries,
      products,
      bankAccounts,
      expenses,
      payments,
      quotes,
      creditNotes,
      debitNotes,
      purchaseOrders,
      recurringTemplates,
      projects: projectsList,
      budgets: budgetsList,
      fixedAssets,
      loans,
      taxRates,
      costCenters,
      documents,
    },
  };
}

export async function checkSnapshotRateLimit(orgId: string): Promise<{ allowed: boolean; retryAfter?: number }> {
  const windowMs = 60 * 60 * 1000; // 1 hour
  const maxPerWindow = 5;
  const windowStart = new Date(Date.now() - windowMs);

  const [{ total }] = await db
    .select({ total: count() })
    .from(dataBackup)
    .where(
      and(
        eq(dataBackup.organizationId, orgId),
        sql`${dataBackup.createdAt} >= ${windowStart}`,
      ),
    );

  if (total >= maxPerWindow) {
    const oldest = await db.query.dataBackup.findFirst({
      where: and(
        eq(dataBackup.organizationId, orgId),
        sql`${dataBackup.createdAt} >= ${windowStart}`,
      ),
      orderBy: dataBackup.createdAt,
    });
    const retryAfter = oldest?.createdAt
      ? Math.ceil((oldest.createdAt.getTime() + windowMs - Date.now()) / 1000)
      : 3600;
    return { allowed: false, retryAfter };
  }

  return { allowed: true };
}

export async function buildDownloadSnapshot(orgId: string): Promise<string> {
  const snapshot = await buildOrgSnapshot(orgId);
  return JSON.stringify(snapshot, null, 2);
}

export async function createOrgSnapshot(
  orgId: string,
  userId: string | null,
  type: "scheduled" | "manual" | "uploaded",
) {
  const [backup] = await db
    .insert(dataBackup)
    .values({
      organizationId: orgId,
      type,
      status: "pending",
      createdBy: userId,
    })
    .returning();

  try {
    const snapshot = await buildOrgSnapshot(orgId);

    // Upload to S3
    const fileKey = `backups/${orgId}/${backup.id}.json`;
    const jsonStr = JSON.stringify(snapshot);
    const sizeBytes = await uploadBackup(fileKey, jsonStr);

    // Build entity counts
    const entityCounts: Record<string, number> = {};
    for (const [key, value] of Object.entries(snapshot.entities)) {
      entityCounts[key] = (value as unknown[]).length;
    }

    // Update backup row
    const [updated] = await db
      .update(dataBackup)
      .set({ status: "completed", sizeBytes, entityCounts, fileKey })
      .where(eq(dataBackup.id, backup.id))
      .returning();

    return updated;
  } catch (err) {
    await db
      .update(dataBackup)
      .set({ status: "failed" })
      .where(eq(dataBackup.id, backup.id));
    throw err;
  }
}

/**
 * Every entity a snapshot holds, in the order they're restored (what a record
 * points at comes first), with the child rows stored inside each record.
 * Foreign keys that point forward in this list (or at the same table) are
 * filled in after everything is inserted.
 */
const RESTORE_PLAN: Array<{
  key: string;
  table: PgTable;
  children?: { key: string; table: PgTable; parentKey: string }[];
}> = [
  { key: "taxRates", table: taxRate, children: [{ key: "components", table: taxComponent, parentKey: "taxRateId" }] },
  { key: "costCenters", table: costCenter },
  { key: "accounts", table: chartAccount },
  { key: "contacts", table: contact },
  { key: "bankAccounts", table: bankAccount },
  { key: "products", table: inventoryItem },
  { key: "projects", table: project },
  { key: "budgets", table: budget, children: [{ key: "lines", table: budgetLine, parentKey: "budgetId" }] },
  { key: "journalEntries", table: journalEntry, children: [{ key: "lines", table: journalLine, parentKey: "journalEntryId" }] },
  { key: "invoices", table: invoice, children: [{ key: "lines", table: invoiceLine, parentKey: "invoiceId" }] },
  { key: "quotes", table: quote, children: [{ key: "lines", table: quoteLine, parentKey: "quoteId" }] },
  { key: "purchaseOrders", table: purchaseOrder, children: [{ key: "lines", table: purchaseOrderLine, parentKey: "purchaseOrderId" }] },
  { key: "bills", table: bill, children: [{ key: "lines", table: billLine, parentKey: "billId" }] },
  { key: "creditNotes", table: creditNote, children: [{ key: "lines", table: creditNoteLine, parentKey: "creditNoteId" }] },
  { key: "debitNotes", table: debitNote, children: [{ key: "lines", table: debitNoteLine, parentKey: "debitNoteId" }] },
  { key: "expenses", table: expenseClaim, children: [{ key: "items", table: expenseItem, parentKey: "expenseClaimId" }] },
  { key: "payments", table: payment, children: [{ key: "allocations", table: paymentAllocation, parentKey: "paymentId" }] },
  { key: "fixedAssets", table: fixedAsset },
  { key: "loans", table: loan },
  { key: "recurringTemplates", table: recurringTemplate, children: [{ key: "lines", table: recurringTemplateLine, parentKey: "templateId" }] },
  { key: "documents", table: document },
];

/**
 * Put the organization's books back to a backup. In one transaction: every
 * current record of each type the backup holds is moved to the trash, then the
 * backup's records (and their lines, items and allocations) are written back
 * in dependency order. Any record that can't be restored stops the whole
 * restore with a BackupRestoreError naming it, and nothing changes.
 */
export async function restoreFromSnapshot(
  orgId: string,
  backupId: string,
  ctx: AuthContext,
): Promise<{ restoredCounts: Record<string, number> }> {
  const backup = await db.query.dataBackup.findFirst({
    where: and(
      eq(dataBackup.id, backupId),
      eq(dataBackup.organizationId, orgId),
    ),
  });

  if (!backup || backup.status !== "completed" || !backup.fileKey) {
    throw new BackupRestoreError("Backup not found or not completed", 404);
  }

  const jsonStr = await downloadBackup(backup.fileKey);
  const restoredCounts = await applySnapshot(orgId, JSON.parse(jsonStr));

  logAudit({
    ctx,
    action: "restore_backup",
    entityType: "organization",
    entityId: orgId,
    changes: { backupId, backupDate: backup.createdAt?.toISOString(), restoredCounts },
  });

  return { restoredCounts };
}

/** Write a parsed snapshot back over the organization's data (see restoreFromSnapshot). */
export async function applySnapshot(
  orgId: string,
  snapshot: { entities?: Record<string, Record<string, unknown>[] | undefined> },
): Promise<Record<string, number>> {
  const entities = snapshot.entities ?? {};

  // Only the types this backup actually holds are replaced
  const plan = RESTORE_PLAN.filter((p) => Array.isArray(entities[p.key]));

  // Restore step of every table: parents in order, children right after theirs
  const steps = new Map<Table, number>();
  plan.forEach((p, i) => {
    steps.set(p.table, i);
    for (const c of p.children ?? []) steps.set(c.table, i + 0.5);
  });
  const stepOf = (t: Table) => steps.get(t);

  const now = new Date();
  const restoredCounts: Record<string, number> = {};
  const pending: { table: PgTable; id: unknown; set: Record<string, unknown> }[] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type AnyTable = any;
  const upsert = async (tx: Tx, table: PgTable, step: number, record: Record<string, unknown>, extra: Record<string, unknown>) => {
    const { now: values, later } = splitDeferred(
      { ...toInsertRow(table, record), ...extra },
      deferredColumns(table, step, stepOf),
    );
    const t = table as AnyTable;
    try {
      await tx
        .insert(t)
        .values(values)
        .onConflictDoUpdate({ target: t.id, set: values });
    } catch (err) {
      throw new BackupRestoreError(
        `Couldn't restore ${describeRecord(table, record)}: ${(err as { cause?: Error }).cause?.message ?? (err as Error).message}. Nothing was changed.`,
      );
    }
    if (Object.keys(later).length > 0) pending.push({ table, id: values.id, set: later });
  };

  await db.transaction(async (tx) => {
    // Current records of each restored type go to the trash
    for (const { table } of plan) {
      const t = table as AnyTable;
      await tx
        .update(t)
        .set({ deletedAt: now })
        .where(and(eq(t.organizationId, orgId), isNull(t.deletedAt)));
    }

    for (const [i, { key, table, children }] of plan.entries()) {
      const records = entities[key]!;
      for (const record of records) {
        await upsert(tx, table, i, record, { organizationId: orgId, deletedAt: null });

        // Child rows: write the backup's, remove ones added since
        for (const child of children ?? []) {
          const rows = record[child.key];
          if (!Array.isArray(rows)) continue; // older backups lack some children
          const c = child.table as AnyTable;
          const keepIds = rows.map((r) => (r as { id: string }).id).filter(Boolean);
          try {
            await tx
              .delete(c)
              .where(
                keepIds.length > 0
                  ? and(eq(c[child.parentKey], record.id), notInArray(c.id, keepIds))
                  : eq(c[child.parentKey], record.id),
              );
          } catch (err) {
            throw new BackupRestoreError(
              `Couldn't restore the ${child.key} of ${describeRecord(table, record)}: ${(err as { cause?: Error }).cause?.message ?? (err as Error).message}. Nothing was changed.`,
            );
          }
          for (const row of rows as Record<string, unknown>[]) {
            await upsert(tx, child.table, i + 0.5, row, { [child.parentKey]: record.id });
          }
        }
      }
      restoredCounts[key] = records.length;
    }

    // Links that pointed forward (or within a table) now have their targets
    for (const { table, id, set } of pending) {
      const t = table as AnyTable;
      await tx.update(t).set(set).where(eq(t.id, id));
    }
  });

  return restoredCounts;
}
