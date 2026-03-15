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
} from "@/lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { uploadBackup, downloadBackup } from "./backup-storage";
import { logAudit } from "./audit";
import { notDeleted } from "@/lib/db/soft-delete";
import type { AuthContext } from "./auth-context";

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
    // Query all entity tables for the org (only non-deleted rows)
    const accounts = await db.query.chartAccount.findMany({
      where: and(
        eq(chartAccount.organizationId, orgId),
        notDeleted(chartAccount.deletedAt),
      ),
    });

    const contacts = await db.query.contact.findMany({
      where: and(
        eq(contact.organizationId, orgId),
        notDeleted(contact.deletedAt),
      ),
    });

    const invoices = await db.query.invoice.findMany({
      where: and(
        eq(invoice.organizationId, orgId),
        notDeleted(invoice.deletedAt),
      ),
      with: { lines: true },
    });

    const bills = await db.query.bill.findMany({
      where: and(
        eq(bill.organizationId, orgId),
        notDeleted(bill.deletedAt),
      ),
      with: { lines: true },
    });

    const journalEntries = await db.query.journalEntry.findMany({
      where: and(
        eq(journalEntry.organizationId, orgId),
        notDeleted(journalEntry.deletedAt),
      ),
      with: { lines: true },
    });

    const products = await db.query.inventoryItem.findMany({
      where: and(
        eq(inventoryItem.organizationId, orgId),
        notDeleted(inventoryItem.deletedAt),
      ),
    });

    const bankAccounts = await db.query.bankAccount.findMany({
      where: and(
        eq(bankAccount.organizationId, orgId),
        notDeleted(bankAccount.deletedAt),
      ),
    });

    const expenses = await db.query.expenseClaim.findMany({
      where: and(
        eq(expenseClaim.organizationId, orgId),
        notDeleted(expenseClaim.deletedAt),
      ),
    });

    const payments = await db.query.payment.findMany({
      where: and(
        eq(payment.organizationId, orgId),
        notDeleted(payment.deletedAt),
      ),
    });

    const quotes = await db.query.quote.findMany({
      where: and(
        eq(quote.organizationId, orgId),
        notDeleted(quote.deletedAt),
      ),
      with: { lines: true },
    });

    const creditNotes = await db.query.creditNote.findMany({
      where: and(
        eq(creditNote.organizationId, orgId),
        notDeleted(creditNote.deletedAt),
      ),
      with: { lines: true },
    });

    const debitNotes = await db.query.debitNote.findMany({
      where: and(
        eq(debitNote.organizationId, orgId),
        notDeleted(debitNote.deletedAt),
      ),
      with: { lines: true },
    });

    const purchaseOrders = await db.query.purchaseOrder.findMany({
      where: and(
        eq(purchaseOrder.organizationId, orgId),
        notDeleted(purchaseOrder.deletedAt),
      ),
      with: { lines: true },
    });

    const recurringTemplates = await db.query.recurringTemplate.findMany({
      where: and(
        eq(recurringTemplate.organizationId, orgId),
        notDeleted(recurringTemplate.deletedAt),
      ),
    });

    const projects = await db.query.project.findMany({
      where: and(
        eq(project.organizationId, orgId),
        notDeleted(project.deletedAt),
      ),
    });

    const budgets = await db.query.budget.findMany({
      where: and(
        eq(budget.organizationId, orgId),
        notDeleted(budget.deletedAt),
      ),
    });

    const fixedAssets = await db.query.fixedAsset.findMany({
      where: and(
        eq(fixedAsset.organizationId, orgId),
        notDeleted(fixedAsset.deletedAt),
      ),
    });

    const loans = await db.query.loan.findMany({
      where: and(
        eq(loan.organizationId, orgId),
        notDeleted(loan.deletedAt),
      ),
    });

    const taxRates = await db.query.taxRate.findMany({
      where: and(
        eq(taxRate.organizationId, orgId),
        notDeleted(taxRate.deletedAt),
      ),
    });

    const costCenters = await db.query.costCenter.findMany({
      where: and(
        eq(costCenter.organizationId, orgId),
        notDeleted(costCenter.deletedAt),
      ),
    });

    const documents = await db.query.document.findMany({
      where: and(
        eq(document.organizationId, orgId),
        notDeleted(document.deletedAt),
      ),
    });

    // Build the JSON snapshot
    const snapshot = {
      version: 1,
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
        projects,
        budgets,
        fixedAssets,
        loans,
        taxRates,
        costCenters,
        documents,
      },
    };

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
    throw new Error("Backup not found or not completed");
  }

  const jsonStr = await downloadBackup(backup.fileKey);
  const snapshot = JSON.parse(jsonStr);

  const now = new Date();
  const softDeleteSet = { deletedAt: now };

  // Define table order for soft-deleting current data and inserting restored data
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const entityTableMap: Array<{ key: string; table: any }> = [
    { key: "accounts", table: chartAccount },
    { key: "contacts", table: contact },
    { key: "taxRates", table: taxRate },
    { key: "costCenters", table: costCenter },
    { key: "products", table: inventoryItem },
    { key: "bankAccounts", table: bankAccount },
    { key: "projects", table: project },
    { key: "budgets", table: budget },
    { key: "fixedAssets", table: fixedAsset },
    { key: "loans", table: loan },
    { key: "recurringTemplates", table: recurringTemplate },
    { key: "expenses", table: expenseClaim },
    { key: "payments", table: payment },
  ];

  const restoredCounts: Record<string, number> = {};

  await db.transaction(async (tx) => {
    // Soft-delete all current records
    for (const { table } of entityTableMap) {
      await tx
        .update(table)
        .set(softDeleteSet)
        .where(
          and(eq(table.organizationId, orgId), isNull(table.deletedAt)),
        );
    }

    // Insert records from snapshot (skip complex relational entities for now)
    for (const { key, table } of entityTableMap) {
      const records = snapshot.entities?.[key];
      if (!records || !Array.isArray(records) || records.length === 0)
        continue;

      for (const record of records) {
        // Remove any relation fields that aren't columns
        const { lines, contact: _c, account: _a, ...cleanRecord } = record;
        try {
          await tx
            .insert(table)
            .values({
              ...cleanRecord,
              organizationId: orgId,
              deletedAt: null,
            })
            .onConflictDoUpdate({
              target: table.id,
              set: { ...cleanRecord, deletedAt: null },
            });
        } catch {
          // Skip records that fail FK constraints
        }
      }
      restoredCounts[key] = records.length;
    }
  });

  logAudit({
    ctx,
    action: "restore_backup",
    entityType: "organization",
    entityId: orgId,
    changes: { backupId, backupDate: backup.createdAt?.toISOString() },
  });

  return { restoredCounts };
}
