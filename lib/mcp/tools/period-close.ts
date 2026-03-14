import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db } from "@/lib/db";
import { fiscalYear } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireRole } from "@/lib/api/require-role";
import { wrapTool } from "@/lib/mcp/errors";
import { closeFiscalYear, reopenFiscalYear } from "@/lib/api/period-close";
import type { AuthContext } from "@/lib/api/auth-context";

export function registerPeriodCloseTools(server: McpServer, ctx: AuthContext) {
  server.tool(
    "close_fiscal_year",
    "Close a fiscal year. Creates year-end closing journal entries (DR revenue, CR expense, net to Retained Earnings 3200), sets isClosed=true, and creates a period lock. Validates no draft entries exist first.",
    {
      fiscalYearId: z
        .string()
        .describe("UUID of the fiscal year to close"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:period_lock");

        const result = await closeFiscalYear(
          params.fiscalYearId,
          ctx.organizationId,
          ctx.userId
        );

        if (!result.success) {
          throw new Error(result.error);
        }

        const updated = await db.query.fiscalYear.findFirst({
          where: eq(fiscalYear.id, params.fiscalYearId),
        });

        return { success: true, fiscalYear: updated };
      })
  );

  server.tool(
    "reopen_fiscal_year",
    "Reopen a closed fiscal year. Voids the closing journal entry, sets isClosed=false, and removes the period lock.",
    {
      fiscalYearId: z
        .string()
        .describe("UUID of the fiscal year to reopen"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:period_lock");

        const result = await reopenFiscalYear(
          params.fiscalYearId,
          ctx.organizationId
        );

        if (!result.success) {
          throw new Error(result.error);
        }

        const updated = await db.query.fiscalYear.findFirst({
          where: eq(fiscalYear.id, params.fiscalYearId),
        });

        return { success: true, fiscalYear: updated };
      })
  );

  server.tool(
    "list_fiscal_years",
    "List all fiscal years for the organization with their open/closed status.",
    {},
    () =>
      wrapTool(ctx, async () => {
        const years = await db.query.fiscalYear.findMany({
          where: eq(fiscalYear.organizationId, ctx.organizationId),
        });

        return {
          fiscalYears: years.map((fy) => ({
            id: fy.id,
            name: fy.name,
            startDate: fy.startDate,
            endDate: fy.endDate,
            isClosed: fy.isClosed,
          })),
        };
      })
  );
}
