import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db } from "@/lib/db";
import { savedReport } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { notDeleted, softDelete } from "@/lib/db/soft-delete";
import { requireRole } from "@/lib/api/require-role";
import { wrapTool } from "@/lib/mcp/errors";
import type { AuthContext } from "@/lib/api/auth-context";
import type { ReportConfig } from "@/lib/db/schema/reports";
import {
  runSavedReportConfig,
  SAVED_REPORT_SOURCES,
  SAVED_REPORT_SOURCE_KEYS,
} from "@/lib/reports/saved-report-data";

/**
 * MCP tools for saved (custom) reports: the same data sources and figures as
 * the Custom reports page and its run / export API. Money columns are integer
 * cents and are listed in `moneyColumns` on every result.
 */
const SOURCE_HELP = Object.entries(SAVED_REPORT_SOURCES)
  .map(([key, s]) => `'${key}' (${s.label}; columns: ${s.columns.join(", ")})`)
  .join("; ");

const configShape = {
  dataSource: z.enum(SAVED_REPORT_SOURCE_KEYS).describe(`What the report lists. One of: ${SOURCE_HELP}.`),
  columns: z
    .array(z.string())
    .min(1)
    .describe("Columns to include, from the data source's column list. Unknown names are ignored."),
  filters: z
    .array(
      z.object({
        field: z.string().describe("Column to filter on."),
        operator: z
          .enum(["equals", "contains", "gt", "lt", "gte", "lte"])
          .describe("Comparison. gt/lt/gte/lte compare numbers (money in integer cents)."),
        value: z.string().describe("Value to compare against, as text."),
      })
    )
    .optional()
    .describe("Optional row filters, all must match."),
  dateRange: z
    .object({
      from: z.string().describe("Start date (YYYY-MM-DD), inclusive."),
      to: z.string().describe("End date (YYYY-MM-DD), inclusive."),
    })
    .optional()
    .describe("Optional date range. Monthly and aging sources use it as their reporting window."),
};

function toConfig(p: {
  dataSource: string;
  columns: string[];
  filters?: { field: string; operator: string; value: string }[];
  dateRange?: { from: string; to: string };
}): ReportConfig {
  return {
    dataSource: p.dataSource,
    columns: p.columns,
    filters: p.filters ?? [],
    groupBy: [],
    ...(p.dateRange ? { dateRange: p.dateRange } : {}),
  };
}

export function registerSavedReportTools(server: McpServer, ctx: AuthContext) {
  server.tool(
    "list_saved_reports",
    "List the organization's saved custom reports (name, description and config: data source, columns, filters, date range). Returns { reports }.",
    {},
    () =>
      wrapTool(ctx, async () => {
        const reports = await db.query.savedReport.findMany({
          where: and(eq(savedReport.organizationId, ctx.organizationId), notDeleted(savedReport.deletedAt)),
          orderBy: desc(savedReport.updatedAt),
        });
        return { reports };
      })
  );

  server.tool(
    "run_custom_report",
    "Run a custom report config without saving it and return its rows. Money columns (listed in moneyColumns) are integer cents. Returns { columns, moneyColumns, rows, total }.",
    configShape,
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "view:data");
        const result = await runSavedReportConfig(ctx.organizationId, toConfig(params));
        return { ...result, total: result.rows.length };
      })
  );

  server.tool(
    "run_saved_report",
    "Run a saved custom report by ID and return its rows. Money columns (listed in moneyColumns) are integer cents. Returns { report, columns, moneyColumns, rows, total }.",
    { savedReportId: z.string().describe("UUID of the saved report to run.") },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "view:data");
        const report = await db.query.savedReport.findFirst({
          where: and(
            eq(savedReport.id, params.savedReportId),
            eq(savedReport.organizationId, ctx.organizationId),
            notDeleted(savedReport.deletedAt)
          ),
        });
        if (!report) throw new Error("Saved report not found");
        const result = await runSavedReportConfig(ctx.organizationId, report.config as ReportConfig);
        return { report: { id: report.id, name: report.name }, ...result, total: result.rows.length };
      })
  );

  server.tool(
    "create_saved_report",
    "Save a custom report config under a name so it can be run again or emailed on a schedule (see create_report_schedule). Returns { report }.",
    {
      name: z.string().min(1).describe("Report name shown in the Custom reports list."),
      description: z.string().optional().describe("Optional short description."),
      ...configShape,
    },
    (params) =>
      wrapTool(ctx, async () => {
        const [report] = await db
          .insert(savedReport)
          .values({
            organizationId: ctx.organizationId,
            name: params.name,
            description: params.description ?? null,
            config: toConfig(params),
          })
          .returning();
        return { report };
      })
  );

  server.tool(
    "delete_saved_report",
    "Delete a saved custom report by ID (moved to trash). Returns { deleted: true, savedReportId }.",
    { savedReportId: z.string().describe("UUID of the saved report to delete.") },
    (params) =>
      wrapTool(ctx, async () => {
        const report = await db.query.savedReport.findFirst({
          where: and(
            eq(savedReport.id, params.savedReportId),
            eq(savedReport.organizationId, ctx.organizationId),
            notDeleted(savedReport.deletedAt)
          ),
        });
        if (!report) throw new Error("Saved report not found");
        await db.update(savedReport).set(softDelete()).where(eq(savedReport.id, report.id));
        return { deleted: true, savedReportId: report.id };
      })
  );
}
