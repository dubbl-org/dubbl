import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  bulkImportJob, chartAccount, contact, inventoryItem,
  invoice, invoiceLine, bill, billLine,
  journalEntry, journalLine, bankTransaction, bankAccount,
} from "@/lib/db/schema";
import { eq, and, desc, ilike, sql } from "drizzle-orm";
import { notDeleted } from "@/lib/db/soft-delete";
import { wrapTool } from "@/lib/mcp/errors";
import { getMapping } from "@/lib/import-export/mappings";
import { generateCSV, centsToDecimal } from "@/lib/import-export/csv-utils";
import { parseMoney } from "@/lib/import-export/transformers";
import { resolveContactByName, resolveAccountByCode } from "@/lib/import-export/reference-resolver";
import { assertNotLocked } from "@/lib/api/period-lock";
import type { AuthContext } from "@/lib/api/auth-context";
import type { SourceSystem, ImportEntity } from "@/lib/import-export/types";

export function registerImportExportTools(server: McpServer, ctx: AuthContext) {
  server.tool(
    "get_import_template",
    "Get expected CSV columns and their aliases for a source system and entity type. Use this to understand what columns are expected when importing data from a specific bookkeeping tool.",
    {
      source: z
        .enum(["quickbooks", "xero", "freshbooks", "wave", "custom"])
        .describe("Source bookkeeping system"),
      entityType: z
        .enum(["accounts", "contacts", "invoices", "bills", "entries", "products", "bank-transactions"])
        .describe("Type of entity to import"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const aliases = getMapping(params.source as SourceSystem, params.entityType as ImportEntity);
        return {
          source: params.source,
          entityType: params.entityType,
          columns: aliases.map(a => ({
            field: a.targetField,
            aliases: a.aliases,
          })),
        };
      })
  );

  server.tool(
    "import_csv_data",
    "Import CSV data for a specific entity type. Parses CSV content, maps columns using source-specific aliases, validates, and imports rows. Amounts should be in decimal format (e.g. '125.50'). Returns a job summary with processed/error counts.",
    {
      entityType: z
        .enum(["accounts", "contacts", "products"])
        .describe("Type of entity to import. Currently supports accounts, contacts, and products for direct CSV import."),
      csvContent: z
        .string()
        .describe("Raw CSV content as a string, with headers in the first row"),
      source: z
        .enum(["quickbooks", "xero", "freshbooks", "wave", "custom"])
        .optional()
        .default("custom")
        .describe("Source system for column alias mapping"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        // Parse CSV
        const lines = params.csvContent.split("\n").map(l => l.trim()).filter(Boolean);
        if (lines.length < 2) throw new Error("CSV must have at least a header row and one data row");

        const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));
        const aliases = getMapping(params.source as SourceSystem, params.entityType as ImportEntity);

        // Map headers to target fields
        const aliasMap = new Map<string, string>();
        for (const a of aliases) {
          for (const alias of a.aliases) {
            aliasMap.set(alias.toLowerCase(), a.targetField);
          }
        }

        const headerMapping = headers.map(h => {
          const lower = h.toLowerCase();
          return aliasMap.get(lower) || lower;
        });

        const rows = lines.slice(1).map(line => {
          const values = line.split(",").map(v => v.trim().replace(/^"|"$/g, ""));
          const row: Record<string, string> = {};
          headerMapping.forEach((field, i) => { row[field] = values[i] || ""; });
          return row;
        });

        // Import based on entity type
        const [job] = await db.insert(bulkImportJob).values({
          organizationId: ctx.organizationId,
          type: params.entityType,
          fileName: `mcp-import-${params.entityType}.csv`,
          totalRows: rows.length,
          status: "processing",
          createdBy: ctx.userId,
        }).returning();

        let processedRows = 0;
        let errorRows = 0;
        const errorDetails: Array<{ row: number; error: string }> = [];

        for (let i = 0; i < rows.length; i++) {
          try {
            const row = rows[i];
            if (params.entityType === "accounts") {
              await db.insert(chartAccount).values({
                organizationId: ctx.organizationId,
                code: row.code || "",
                name: row.name || "",
                type: (row.type as "asset" | "liability" | "equity" | "revenue" | "expense") || "expense",
                subType: row.subType || null,
                description: row.description || null,
              });
            } else if (params.entityType === "contacts") {
              await db.insert(contact).values({
                organizationId: ctx.organizationId,
                name: row.name || "",
                email: row.email || null,
                phone: row.phone || null,
                type: (row.type as "customer" | "supplier" | "both") || "customer",
                taxNumber: row.taxNumber || null,
              });
            } else if (params.entityType === "products") {
              await db.insert(inventoryItem).values({
                organizationId: ctx.organizationId,
                code: row.sku || `PROD-${String(i + 1).padStart(4, "0")}`,
                name: row.name || "",
                sku: row.sku || null,
                description: row.description || null,
                salePrice: parseMoney(row.unitPrice || "0"),
                purchasePrice: parseMoney(row.costPrice || "0"),
                quantityOnHand: parseInt(row.quantityOnHand || "0") || 0,
              });
            }
            processedRows++;
          } catch (err) {
            errorRows++;
            errorDetails.push({ row: i + 1, error: err instanceof Error ? err.message : "Unknown error" });
          }
        }

        await db.update(bulkImportJob).set({
          processedRows,
          errorRows,
          errorDetails: errorDetails.length > 0 ? errorDetails : null,
          status: errorRows === rows.length ? "failed" : "completed",
          completedAt: new Date(),
        }).where(eq(bulkImportJob.id, job.id));

        return {
          jobId: job.id,
          totalRows: rows.length,
          processedRows,
          errorRows,
          status: errorRows === rows.length ? "failed" : "completed",
          errors: errorDetails.slice(0, 10),
        };
      })
  );

  server.tool(
    "import_journal_entries",
    "Bulk-import balanced double-entry journal entries. Rows are grouped into entries by entryNumber (falling back to date+description when entryNumber is omitted). Each resulting entry MUST balance: the sum of its line debits must equal the sum of its line credits, the entry must move a non-zero amount, it must have at least 2 lines, and no single line may carry both a debit and a credit. Account codes are resolved within the organization and must reference an existing, active (non-deleted) account. Unbalanced or invalid entries are skipped and reported in errors; only valid entries are inserted. All amounts are integer cents (e.g. $12.50 = 1250). By default entries are created as drafts; set post=true to post them, which also enforces that each entry date is not in a locked period or closed fiscal year. Returns a job summary with processed/error counts.",
    {
      rows: z
        .array(
          z.object({
            entryNumber: z
              .string()
              .optional()
              .describe("Groups lines into one entry. Lines sharing an entryNumber form a single entry. If omitted, lines are grouped by date+description."),
            date: z
              .string()
              .describe("Entry date in YYYY-MM-DD format."),
            description: z
              .string()
              .describe("Entry description."),
            reference: z
              .string()
              .optional()
              .describe("Optional external reference for the entry."),
            lineAccountCode: z
              .string()
              .describe("Chart-of-accounts code for this line. Must reference an existing, active account in the organization."),
            debit: z
              .number()
              .int()
              .min(0)
              .optional()
              .default(0)
              .describe("Debit amount in integer cents (e.g. $12.50 = 1250). A line may have a debit or a credit, but not both."),
            credit: z
              .number()
              .int()
              .min(0)
              .optional()
              .default(0)
              .describe("Credit amount in integer cents (e.g. $12.50 = 1250). A line may have a debit or a credit, but not both."),
          })
        )
        .min(1)
        .describe("Flat list of journal lines. Lines are grouped into balanced entries by entryNumber (or date+description)."),
      post: z
        .boolean()
        .optional()
        .default(false)
        .describe("When true, created entries are posted (status 'posted' with postedAt) and each entry date is checked against locked periods / closed fiscal years. When false (default), entries are created as drafts."),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const rows = params.rows;
        const post = params.post;

        const [job] = await db.insert(bulkImportJob).values({
          organizationId: ctx.organizationId,
          type: "entries",
          fileName: "mcp-import-entries",
          totalRows: rows.length,
          status: "processing",
          createdBy: ctx.userId,
        }).returning();

        // Group rows into entries, preserving first-seen order.
        type Row = (typeof rows)[number];
        const groupOrder: string[] = [];
        const entryGroups = new Map<string, Row[]>();
        for (const row of rows) {
          const key = row.entryNumber || `${row.date}|${row.description}`;
          let existing = entryGroups.get(key);
          if (!existing) {
            existing = [];
            entryGroups.set(key, existing);
            groupOrder.push(key);
          }
          existing.push(row);
        }

        // Allocate entry numbers sequentially within this pass so groups never
        // collide on the same number.
        const [maxResult] = await db
          .select({ max: sql<number>`COALESCE(MAX(entry_number), 0)`.mapWith(Number) })
          .from(journalEntry)
          .where(eq(journalEntry.organizationId, ctx.organizationId));
        let nextEntryNumber = (maxResult?.max ?? 0) + 1;

        let processedRows = 0;
        let errorRows = 0;
        const errorDetails: Array<{ row: number; error: string }> = [];
        let groupIndex = 0;

        for (const key of groupOrder) {
          const groupRows = entryGroups.get(key)!;
          const firstRow = groupRows[0];
          groupIndex++;
          try {
            if (groupRows.length < 2) {
              throw new Error("Entry must have at least 2 lines");
            }

            const lines = [];
            let totalDebit = 0;
            let totalCredit = 0;
            for (const row of groupRows) {
              const account = await db.query.chartAccount.findFirst({
                where: and(
                  eq(chartAccount.organizationId, ctx.organizationId),
                  ilike(chartAccount.code, row.lineAccountCode.trim()),
                  notDeleted(chartAccount.deletedAt),
                ),
                columns: { id: true, isActive: true },
              });
              if (!account) throw new Error(`Account not found: "${row.lineAccountCode}"`);
              if (!account.isActive) throw new Error(`Account is inactive: "${row.lineAccountCode}"`);

              const debitAmount = row.debit ?? 0;
              const creditAmount = row.credit ?? 0;
              if (debitAmount !== 0 && creditAmount !== 0) {
                throw new Error(`Line for account "${row.lineAccountCode}" cannot have both a debit and a credit`);
              }

              totalDebit += debitAmount;
              totalCredit += creditAmount;
              lines.push({ accountId: account.id, debitAmount, creditAmount });
            }

            if (totalDebit !== totalCredit) {
              const imbalance = totalDebit - totalCredit;
              throw new Error(
                `Entry does not balance: debits ${totalDebit} != credits ${totalCredit} (imbalance ${imbalance} cents)`
              );
            }
            if (totalDebit === 0) {
              throw new Error("Entry must have non-zero amounts");
            }

            if (post) {
              await assertNotLocked(ctx.organizationId, firstRow.date);
            }

            const entryNumber = nextEntryNumber;
            const [created] = await db.insert(journalEntry).values({
              organizationId: ctx.organizationId,
              entryNumber,
              date: firstRow.date,
              description: firstRow.description,
              reference: firstRow.reference || null,
              status: post ? "posted" : "draft",
              postedAt: post ? new Date() : null,
              sourceType: "manual",
              createdBy: ctx.userId,
            }).returning();
            nextEntryNumber++;

            await db.insert(journalLine).values(
              lines.map(l => ({ journalEntryId: created.id, ...l }))
            );
            processedRows++;
          } catch (err) {
            errorRows++;
            errorDetails.push({ row: groupIndex, error: err instanceof Error ? err.message : "Unknown error" });
          }
        }

        const status = errorRows === entryGroups.size ? "failed" : "completed";
        await db.update(bulkImportJob).set({
          processedRows,
          errorRows,
          errorDetails: errorDetails.length > 0 ? errorDetails : null,
          status,
          completedAt: new Date(),
        }).where(eq(bulkImportJob.id, job.id));

        return {
          jobId: job.id,
          totalEntries: entryGroups.size,
          processedEntries: processedRows,
          errorEntries: errorRows,
          posted: post,
          status,
          errors: errorDetails.slice(0, 10),
        };
      })
  );

  server.tool(
    "export_csv_data",
    "Export organization data as CSV text. Amounts are exported as decimal strings (e.g. '125.50'). Foreign keys are resolved to human-readable names where possible.",
    {
      entityType: z
        .enum(["accounts", "contacts", "invoices", "bills", "entries", "products", "bank-transactions"])
        .describe("Type of entity to export"),
      dateFrom: z
        .string()
        .optional()
        .describe("Start date filter (YYYY-MM-DD) for transactional entities"),
      dateTo: z
        .string()
        .optional()
        .describe("End date filter (YYYY-MM-DD) for transactional entities"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        let csv = "";

        if (params.entityType === "accounts") {
          const accounts = await db.query.chartAccount.findMany({
            where: and(eq(chartAccount.organizationId, ctx.organizationId), notDeleted(chartAccount.deletedAt)),
          });
          csv = generateCSV(
            accounts.map(a => ({ code: a.code, name: a.name, type: a.type, subType: a.subType || "", description: a.description || "" })),
            ["code", "name", "type", "subType", "description"]
          );
        } else if (params.entityType === "contacts") {
          const contacts = await db.query.contact.findMany({
            where: and(eq(contact.organizationId, ctx.organizationId), notDeleted(contact.deletedAt)),
          });
          csv = generateCSV(
            contacts.map(c => ({ name: c.name, email: c.email || "", phone: c.phone || "", type: c.type, taxNumber: c.taxNumber || "" })),
            ["name", "email", "phone", "type", "taxNumber"]
          );
        } else if (params.entityType === "products") {
          const products = await db.query.inventoryItem.findMany({
            where: and(eq(inventoryItem.organizationId, ctx.organizationId), notDeleted(inventoryItem.deletedAt)),
          });
          csv = generateCSV(
            products.map(p => ({ name: p.name, sku: p.sku || "", unitPrice: centsToDecimal(p.salePrice), costPrice: centsToDecimal(p.purchasePrice), quantityOnHand: p.quantityOnHand })),
            ["name", "sku", "unitPrice", "costPrice", "quantityOnHand"]
          );
        } else if (params.entityType === "entries") {
          const entries = await db.query.journalEntry.findMany({
            where: and(eq(journalEntry.organizationId, ctx.organizationId), notDeleted(journalEntry.deletedAt)),
            with: { lines: { with: { account: true } } },
          });
          const rows: Record<string, unknown>[] = [];
          for (const entry of entries) {
            for (const line of entry.lines || []) {
              rows.push({
                entryNumber: entry.entryNumber, date: entry.date, description: entry.description,
                accountCode: line.account?.code || "", debit: line.debitAmount > 0 ? centsToDecimal(line.debitAmount) : "",
                credit: line.creditAmount > 0 ? centsToDecimal(line.creditAmount) : "",
              });
            }
          }
          csv = generateCSV(rows, ["entryNumber", "date", "description", "accountCode", "debit", "credit"]);
        } else {
          throw new Error(`Export for ${params.entityType} not yet supported via MCP. Use the REST API at /api/v1/export/${params.entityType}`);
        }

        return { entityType: params.entityType, csv, rowCount: csv.split("\n").length - 1 };
      })
  );

  server.tool(
    "list_import_jobs",
    "List past bulk import jobs for the organization, ordered by most recent first.",
    {
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .default(20)
        .describe("Maximum number of jobs to return (default 20, max 100)"),
      offset: z
        .number()
        .int()
        .min(0)
        .optional()
        .default(0)
        .describe("Number of jobs to skip for pagination"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const jobs = await db.query.bulkImportJob.findMany({
          where: eq(bulkImportJob.organizationId, ctx.organizationId),
          orderBy: desc(bulkImportJob.createdAt),
          limit: params.limit,
          offset: params.offset,
        });

        return { jobs, total: jobs.length };
      })
  );
}
