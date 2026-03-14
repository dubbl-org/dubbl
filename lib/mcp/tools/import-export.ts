import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  bulkImportJob, chartAccount, contact, inventoryItem,
  invoice, invoiceLine, bill, billLine,
  journalEntry, journalLine, bankTransaction, bankAccount,
} from "@/lib/db/schema";
import { eq, and, desc, ilike } from "drizzle-orm";
import { notDeleted } from "@/lib/db/soft-delete";
import { wrapTool } from "@/lib/mcp/errors";
import { getMapping } from "@/lib/import-export/mappings";
import { generateCSV, centsToDecimal } from "@/lib/import-export/csv-utils";
import { parseMoney } from "@/lib/import-export/transformers";
import { resolveContactByName, resolveAccountByCode } from "@/lib/import-export/reference-resolver";
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
