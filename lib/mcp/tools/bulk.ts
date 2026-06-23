import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  bankTransaction,
  bankAccount,
  chartAccount,
  invoice,
  contact,
  organization,
  emailConfig,
  reminderLog,
  auditLog,
} from "@/lib/db/schema";
import { eq, and, inArray, sql } from "drizzle-orm";
import { notDeleted, softDelete } from "@/lib/db/soft-delete";
import { requireRole } from "@/lib/api/require-role";
import { wrapTool } from "@/lib/mcp/errors";
import { createCategorizationJournalEntry, resolveBaseRate } from "@/lib/api/journal-automation";
import { ensureBankLedgerAccount } from "@/lib/api/bank-ledger";
import { MissingExchangeRateError } from "@/lib/currency/converter";
import { sendEmail } from "@/lib/email/smtp-client";
import { renderTemplate } from "@/lib/email/template-engine";
import { formatMoney } from "@/lib/money";
import type { AuthContext } from "@/lib/api/auth-context";

/**
 * MCP tools for high-value BULK operations — the batch equivalents of
 * single-record actions an AI agent will reach for when cleaning up or
 * processing many records at once.
 *
 * Mirrors these REST routes exactly:
 *   - POST /api/v1/bulk/bank-transactions/categorize  (per-item cash coding)
 *   - POST /api/v1/bulk/invoices/mark-paid
 *   - POST /api/v1/bulk/invoices/send                 (draft -> sent flip)
 *   - POST /api/v1/invoices/bulk  (action: "send-reminder")
 *   - POST /api/v1/bulk/contacts/tag                  (sets customer/supplier/both)
 *   - POST /api/v1/bulk/contacts/delete
 *
 * Every query and every id passed in is org-scoped to ctx.organizationId and
 * verified to belong to this org BEFORE any mutation — critical for bulk, where
 * a single un-scoped id could mutate another org's data. Direct Drizzle access
 * (no HTTP self-calls). All monetary amounts are integer cents ($12.50 = 1250).
 *
 * Audit rows are inserted directly via Drizzle (matching the MCP convention in
 * bank-transactions.ts) because MCP tools have no HTTP Request to derive
 * IP/user-agent from.
 */
export function registerBulkTools(server: McpServer, ctx: AuthContext) {
  // -------------------------------------------------------------------------
  // bulk_categorize_bank_transactions — per-item "cash coding".
  // Mirrors POST /api/v1/bulk/bank-transactions/categorize. Unlike
  // bulk_cash_code (one account for ALL lines), each item here codes to its OWN
  // account/contact/tax/cost-center/project.
  // -------------------------------------------------------------------------
  server.tool(
    "bulk_categorize_bank_transactions",
    "Bulk-categorize many bank transactions in one call, where EACH transaction codes to its OWN chart-of-accounts account (and optional contact, tax rate, cost center, project, memo). This is the per-item batch of the single Categorize action; use bulk_cash_code instead when every line goes to the SAME account. Each item is posted in its own DB transaction (DR bank / CR account for money in; DR account / CR bank for money out), marked reconciled, and audited. Every transaction must belong to a bank account in THIS org and be unreconciled. Per-item failures (not found, not this org's, already reconciled, missing FX rate, target account not in org) are isolated and reported; the rest still commit. Amounts are integer cents.",
    {
      items: z
        .array(
          z.object({
            transactionId: z.string().min(1).describe("UUID of the bank transaction to code"),
            accountId: z
              .string()
              .min(1)
              .describe("UUID of the chart-of-accounts account to post the other side of this line to"),
            contactId: z
              .string()
              .nullable()
              .optional()
              .describe("Optional UUID of a contact to attribute this transaction to"),
            taxRateId: z
              .string()
              .nullable()
              .optional()
              .describe("Optional UUID of a tax rate to split the (tax-inclusive) amount into net + tax"),
            memo: z
              .string()
              .nullable()
              .optional()
              .describe("Optional memo for this line; defaults to the transaction description"),
            costCenterId: z
              .string()
              .nullable()
              .optional()
              .describe("Optional UUID of a cost center to tag this transaction with"),
            projectId: z
              .string()
              .nullable()
              .optional()
              .describe("Optional UUID of a project to tag this transaction with"),
          })
        )
        .min(1)
        .max(200)
        .describe("Bank transactions to categorize, each to its own account (max 200)"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:banking");

        const items = params.items;

        type ItemResult = {
          transactionId: string;
          success: boolean;
          journalEntryId?: string | null;
          error?: string;
        };
        const results: ItemResult[] = [];

        // Cache org-scoped bank-account + chart-account lookups across the batch.
        const bankAccountCache = new Map<
          string,
          {
            id: string;
            accountName: string;
            accountType: string;
            currencyCode: string;
            chartAccountId: string | null;
          } | null
        >();
        const targetAccountCache = new Map<string, boolean>();

        for (const item of items) {
          try {
            // Load the bank transaction (not yet org-scoped — scoped via its
            // owning bank account below).
            const transaction = await db.query.bankTransaction.findFirst({
              where: eq(bankTransaction.id, item.transactionId),
            });
            if (!transaction) {
              results.push({ transactionId: item.transactionId, success: false, error: "Bank transaction not found" });
              continue;
            }

            // Resolve + org-scope the owning bank account (cached). A transaction
            // that isn't this org's resolves to null -> reported as not found, so
            // we never touch another org's data.
            let bankAcct = bankAccountCache.get(transaction.bankAccountId);
            if (bankAcct === undefined) {
              const found = await db.query.bankAccount.findFirst({
                where: and(
                  eq(bankAccount.id, transaction.bankAccountId),
                  eq(bankAccount.organizationId, ctx.organizationId),
                  notDeleted(bankAccount.deletedAt)
                ),
                columns: {
                  id: true,
                  accountName: true,
                  accountType: true,
                  currencyCode: true,
                  chartAccountId: true,
                },
              });
              bankAcct = found ?? null;
              bankAccountCache.set(transaction.bankAccountId, bankAcct);
            }
            if (!bankAcct) {
              results.push({ transactionId: item.transactionId, success: false, error: "Bank transaction not found" });
              continue;
            }

            if (transaction.status === "reconciled") {
              results.push({ transactionId: item.transactionId, success: false, error: "Transaction already reconciled" });
              continue;
            }

            // Connect the bank account to its ledger account automatically
            // (older accounts self-heal on first use).
            if (!bankAcct.chartAccountId) {
              bankAcct.chartAccountId = await ensureBankLedgerAccount(ctx.organizationId, bankAcct);
            }

            // Verify the chosen target account belongs to this org (cached).
            let targetOk = targetAccountCache.get(item.accountId);
            if (targetOk === undefined) {
              const target = await db.query.chartAccount.findFirst({
                where: and(
                  eq(chartAccount.id, item.accountId),
                  eq(chartAccount.organizationId, ctx.organizationId)
                ),
                columns: { id: true },
              });
              targetOk = !!target;
              targetAccountCache.set(item.accountId, targetOk);
            }
            if (!targetOk) {
              results.push({ transactionId: item.transactionId, success: false, error: "Account not found" });
              continue;
            }

            const currencyCode = transaction.currencyCode || bankAcct.currencyCode || undefined;

            // Pre-flight the FX rate so a missing rate fails THIS item cleanly
            // (without opening a transaction) while the rest of the batch
            // continues.
            await resolveBaseRate(ctx.organizationId, currencyCode, transaction.date);

            // Post + mark this single item inside its OWN db.transaction so a
            // DB-level error rolls back ONLY this item.
            const bankGlAccountId = bankAcct.chartAccountId!;
            const entry = await db.transaction(async (tx) => {
              const posted = await createCategorizationJournalEntry(
                { organizationId: ctx.organizationId, userId: ctx.userId },
                {
                  bankGlAccountId,
                  otherAccountId: item.accountId,
                  amount: transaction.amount,
                  date: transaction.date,
                  reference: transaction.reference || transaction.description,
                  description: item.memo?.trim() || transaction.description,
                  currencyCode,
                  taxRateId: item.taxRateId || null,
                },
                tx
              );

              await tx
                .update(bankTransaction)
                .set({
                  status: "reconciled",
                  accountId: item.accountId,
                  contactId: item.contactId || null,
                  taxRateId: item.taxRateId || null,
                  costCenterId: item.costCenterId || null,
                  projectId: item.projectId || null,
                  journalEntryId: posted?.id || null,
                })
                .where(eq(bankTransaction.id, item.transactionId));

              return posted;
            });

            results.push({
              transactionId: item.transactionId,
              success: true,
              journalEntryId: entry?.id || null,
            });
          } catch (err) {
            const message =
              err instanceof MissingExchangeRateError
                ? err.message
                : err instanceof Error
                ? err.message
                : "Failed to categorize transaction";
            results.push({ transactionId: item.transactionId, success: false, error: message });
          }
        }

        // Audit only the items that actually posted.
        for (const r of results) {
          if (!r.success) continue;
          await db.insert(auditLog).values({
            organizationId: ctx.organizationId,
            userId: ctx.userId,
            action: "categorized",
            entityType: "bank_transaction",
            entityId: r.transactionId,
            changes: { journalEntryId: r.journalEntryId ?? null, bulk: true },
          });
        }

        const succeeded = results.filter((r) => r.success).length;
        const failed = results.length - succeeded;

        return { results, summary: { total: results.length, succeeded, failed } };
      })
  );

  // -------------------------------------------------------------------------
  // bulk_mark_invoices_paid — mark many invoices fully paid.
  // Mirrors POST /api/v1/bulk/invoices/mark-paid. Void invoices are skipped.
  // -------------------------------------------------------------------------
  server.tool(
    "bulk_mark_invoices_paid",
    "Mark many invoices as fully PAID in one call (sets status=paid, amountPaid=total, amountDue=0, paidAt=now). Use this to clear off invoices that have been settled outside the system. Void invoices in the list are skipped. Every id is org-scoped — only invoices in THIS org are touched. NOTE: this is a status/balance flip only; it does NOT record a payment or post a payment journal entry (use pay_invoice for a single invoice with a real payment + GL posting). Returns the number updated.",
    {
      ids: z
        .array(z.string().uuid())
        .min(1)
        .max(100)
        .describe("UUIDs of the invoices to mark as paid (max 100)"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:invoices");

        const ids = params.ids;

        const invoices = await db.query.invoice.findMany({
          where: and(inArray(invoice.id, ids), eq(invoice.organizationId, ctx.organizationId)),
        });

        let count = 0;
        for (const inv of invoices) {
          if (inv.status === "void") continue;
          await db
            .update(invoice)
            .set({
              status: "paid",
              amountPaid: inv.total,
              amountDue: 0,
              paidAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(invoice.id, inv.id));
          count++;
        }

        const paidIds = invoices.filter((inv) => inv.status !== "void").map((inv) => inv.id);
        await db.insert(auditLog).values({
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          action: "pay",
          entityType: "invoice",
          entityId: ctx.organizationId,
          changes: { count, ids: paidIds, bulk: true },
        });

        return { updated: count };
      })
  );

  // -------------------------------------------------------------------------
  // bulk_mark_invoices_sent — flip many draft invoices to "sent".
  // Mirrors POST /api/v1/bulk/invoices/send. Only DRAFT invoices in this org
  // are touched. (This is the lightweight status flip — it does NOT email or
  // post a GL entry; use the per-invoice send for that.)
  // -------------------------------------------------------------------------
  server.tool(
    "bulk_mark_invoices_sent",
    "Mark many DRAFT invoices as SENT in one call (sets status=sent, sentAt=now). Only invoices in THIS org that are currently in draft are updated; non-draft and other-org ids are ignored. NOTE: this is a status flip only — it does NOT email the customer and does NOT post a recognition/COGS journal entry. Returns the count and the ids actually updated.",
    {
      ids: z
        .array(z.string().uuid())
        .min(1)
        .max(100)
        .describe("UUIDs of the draft invoices to mark as sent (max 100)"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:invoices");

        const ids = params.ids;

        const updated = await db
          .update(invoice)
          .set({ status: "sent", sentAt: new Date(), updatedAt: new Date() })
          .where(
            and(
              inArray(invoice.id, ids),
              eq(invoice.organizationId, ctx.organizationId),
              eq(invoice.status, "draft")
            )
          )
          .returning({ id: invoice.id });

        await db.insert(auditLog).values({
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          action: "send",
          entityType: "invoice",
          entityId: ctx.organizationId,
          changes: { count: updated.length, ids: updated.map((r) => r.id), bulk: true },
        });

        return { updated: updated.length, ids: updated.map((r) => r.id) };
      })
  );

  // -------------------------------------------------------------------------
  // bulk_send_invoice_reminders — email overdue reminders for many invoices.
  // Mirrors POST /api/v1/invoices/bulk { action: "send-reminder" }.
  // -------------------------------------------------------------------------
  // Default reminder copy used when the org has no reminder rule template. Kept
  // plain and customer-facing (end users aren't accountants). Mirrors the route.
  const DEFAULT_SUBJECT = "Reminder: invoice {{documentNumber}} from {{organizationName}}";
  const DEFAULT_BODY =
    "<p>Hi {{contactName}},</p>" +
    "<p>This is a friendly reminder that invoice <strong>{{documentNumber}}</strong> " +
    "for <strong>{{amountDue}}</strong> was due on {{dueDate}}.</p>" +
    "<p>If you've already paid, please ignore this message. Thank you!</p>" +
    "<p>{{organizationName}}</p>";

  server.tool(
    "bulk_send_invoice_reminders",
    "Email a payment reminder for each of the given invoices in one call. Requires verified org email (SMTP) to be set up. Only invoices that are owed money are reminded — draft, void, and paid invoices are skipped, as are invoices whose customer has no email. One email per invoice; a single failure never aborts the batch (each result is reported as sent/skipped/failed). Each successful reminder is logged and bumps that invoice's overdue (dunning) stage by one. All ids are org-scoped to THIS org. Returns per-invoice results plus a summary.",
    {
      invoiceIds: z
        .array(z.string().min(1))
        .min(1)
        .max(200)
        .describe("UUIDs of the invoices to send reminders for (max 200; duplicates ignored)"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        // Sending reminders is an email/recurring concern — same permission the
        // reminder rules + processor (and the REST route) use.
        requireRole(ctx, "manage:recurring");

        // De-dupe ids while preserving order.
        const ids = [...new Set(params.invoiceIds)];

        // SMTP must be configured + verified or nothing can go out.
        const config = await db.query.emailConfig.findFirst({
          where: eq(emailConfig.organizationId, ctx.organizationId),
        });
        if (!config || !config.isVerified) {
          throw new Error("Email is not set up yet. Connect and verify your email to send reminders.");
        }

        const org = await db.query.organization.findFirst({
          where: eq(organization.id, ctx.organizationId),
        });

        // Org-scoped load of just the requested invoices, with the contact for
        // the recipient email + name.
        const invoices = await db.query.invoice.findMany({
          where: and(
            eq(invoice.organizationId, ctx.organizationId),
            inArray(invoice.id, ids),
            notDeleted(invoice.deletedAt)
          ),
          with: { contact: true },
        });
        const byId = new Map(invoices.map((i) => [i.id, i]));

        type ResultStatus = "sent" | "skipped" | "failed";
        const results: Array<{ invoiceId: string; status: ResultStatus; message?: string }> = [];
        let sent = 0;

        for (const id of ids) {
          const inv = byId.get(id);
          if (!inv) {
            results.push({ invoiceId: id, status: "skipped", message: "Not found" });
            continue;
          }
          // Reminders only make sense for invoices that are owed money.
          if (inv.status === "draft" || inv.status === "void" || inv.status === "paid") {
            results.push({ invoiceId: id, status: "skipped", message: "Nothing owed on this invoice" });
            continue;
          }
          const recipient = inv.contact?.email;
          if (!recipient) {
            results.push({ invoiceId: id, status: "skipped", message: "Customer has no email" });
            continue;
          }

          const dueDate = new Date(inv.dueDate);
          const diffDays = Math.floor((Date.now() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
          const vars = {
            contactName: inv.contact?.name || "",
            documentNumber: inv.invoiceNumber,
            amountDue: formatMoney(inv.amountDue, inv.currencyCode),
            dueDate: inv.dueDate,
            organizationName: org?.name || "",
            daysOverdue: String(Math.max(0, diffDays)),
          };
          const subject = renderTemplate(DEFAULT_SUBJECT, vars);
          const html = renderTemplate(DEFAULT_BODY, vars);

          try {
            await sendEmail(config, { to: recipient, subject, html });
            await db.insert(reminderLog).values({
              organizationId: ctx.organizationId,
              reminderRuleId: null,
              documentType: "invoice",
              documentId: inv.id,
              recipientEmail: recipient,
              subject,
              status: "sent",
            });
            // Bump this invoice's dunning stage by one per sent reminder.
            // Org-scoped so we never touch another org's row.
            await db
              .update(invoice)
              .set({ dunningLevel: sql`${invoice.dunningLevel} + 1` })
              .where(and(eq(invoice.id, inv.id), eq(invoice.organizationId, ctx.organizationId)));
            results.push({ invoiceId: id, status: "sent", message: `Sent to ${recipient}` });
            sent++;
          } catch (err) {
            const message = err instanceof Error ? err.message : "Send failed";
            await db.insert(reminderLog).values({
              organizationId: ctx.organizationId,
              reminderRuleId: null,
              documentType: "invoice",
              documentId: inv.id,
              recipientEmail: recipient,
              subject,
              status: "failed",
              errorMessage: message,
            });
            results.push({ invoiceId: id, status: "failed", message });
          }
        }

        await db.insert(auditLog).values({
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          action: "bulk-send-reminder",
          entityType: "invoice",
          entityId: ctx.organizationId,
          changes: { requested: ids.length, sent, bulk: true },
        });

        const summary = {
          total: results.length,
          sent: results.filter((r) => r.status === "sent").length,
          skipped: results.filter((r) => r.status === "skipped").length,
          failed: results.filter((r) => r.status === "failed").length,
        };

        return { action: "send-reminder", results, summary };
      })
  );

  // -------------------------------------------------------------------------
  // bulk_set_contacts_type — set customer/supplier/both on many contacts.
  // Mirrors POST /api/v1/bulk/contacts/tag (the route's "tag" is really the
  // contact TYPE — customer / supplier / both — not a free-form label).
  // -------------------------------------------------------------------------
  server.tool(
    "bulk_set_contacts_type",
    "Set the TYPE (customer, supplier, or both) on many contacts in one call. This is the bulk equivalent of the 'tag' action — it classifies contacts, it does not attach free-form tags. Only contacts in THIS org are updated; other-org ids are ignored. Returns the number updated.",
    {
      ids: z
        .array(z.string().uuid())
        .min(1)
        .max(100)
        .describe("UUIDs of the contacts to update (max 100)"),
      type: z
        .enum(["customer", "supplier", "both"])
        .describe("The classification to apply to every listed contact"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:contacts");

        const { ids, type } = params;

        const updated = await db
          .update(contact)
          .set({ type, updatedAt: new Date() })
          .where(and(inArray(contact.id, ids), eq(contact.organizationId, ctx.organizationId)))
          .returning({ id: contact.id });

        return { updated: updated.length };
      })
  );

  // -------------------------------------------------------------------------
  // bulk_delete_contacts — soft-delete many contacts.
  // Mirrors POST /api/v1/bulk/contacts/delete.
  // -------------------------------------------------------------------------
  server.tool(
    "bulk_delete_contacts",
    "Soft-delete many contacts in one call (they move to trash and can be restored). Only contacts in THIS org are deleted; other-org ids are ignored. Each deletion is audited. Returns the number deleted.",
    {
      ids: z
        .array(z.string().uuid())
        .min(1)
        .max(100)
        .describe("UUIDs of the contacts to delete (max 100)"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:contacts");

        const ids = params.ids;

        const updated = await db
          .update(contact)
          .set(softDelete())
          .where(and(inArray(contact.id, ids), eq(contact.organizationId, ctx.organizationId)))
          .returning({ id: contact.id });

        for (const row of updated) {
          await db.insert(auditLog).values({
            organizationId: ctx.organizationId,
            userId: ctx.userId,
            action: "delete",
            entityType: "contact",
            entityId: row.id,
            changes: { id: row.id, bulk: true },
          });
        }

        return { deleted: updated.length };
      })
  );
}
