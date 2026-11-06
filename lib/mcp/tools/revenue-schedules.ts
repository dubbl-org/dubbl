import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db } from "@/lib/db";
import { revenueSchedule } from "@/lib/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { requireRole } from "@/lib/api/require-role";
import { wrapTool } from "@/lib/mcp/errors";
import type { AuthContext } from "@/lib/api/auth-context";
import {
  cancelRevenueSchedule,
  createRevenueSchedule,
  getRevenueSchedule,
  recognizeNextRevenueEntry,
} from "@/lib/api/revenue-schedules";

/**
 * MCP tools for revenue recognition schedules (deferred revenue).
 *
 * Creating a schedule moves the scheduled income out of the invoice's income
 * account into deferred revenue; each period then moves its share back
 * (DR Deferred Revenue / CR income). Shares lib/api/revenue-schedules.ts with
 * the REST routes and the daily job. All amounts are integer cents. Direct DB
 * access via Drizzle, org-scoped via ctx.organizationId (no HTTP self-calls).
 */
export function registerRevenueScheduleTools(server: McpServer, ctx: AuthContext) {
  server.tool(
    "list_revenue_schedules",
    "List revenue recognition schedules (deferred revenue) with optional status filter and pagination. Each schedule includes its invoiceNumber and its generated period entries. Amounts (totalAmount, recognizedAmount, each entry's amount) are in integer cents.",
    {
      status: z
        .enum(["active", "completed", "cancelled"])
        .optional()
        .describe("Filter by schedule status"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .default(50)
        .describe("Number of schedules to return (max 100)"),
      page: z.number().int().min(1).optional().default(1).describe("Page number"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const conditions = [eq(revenueSchedule.organizationId, ctx.organizationId)];
        if (params.status) conditions.push(eq(revenueSchedule.status, params.status));

        const offset = (params.page - 1) * params.limit;
        const schedules = await db.query.revenueSchedule.findMany({
          where: and(...conditions),
          orderBy: desc(revenueSchedule.createdAt),
          limit: params.limit,
          offset,
          with: { entries: true, invoice: { columns: { invoiceNumber: true } } },
        });
        const [countResult] = await db
          .select({ count: sql<number>`count(*)`.mapWith(Number) })
          .from(revenueSchedule)
          .where(and(...conditions));

        return {
          revenueSchedules: schedules.map(({ invoice: inv, ...rest }) => ({ ...rest, invoiceNumber: inv?.invoiceNumber ?? null })),
          total: Number(countResult?.count || 0),
        };
      })
  );

  server.tool(
    "get_revenue_schedule",
    "Get a single revenue recognition schedule by ID with its period entries (each showing periodDate, amount in integer cents, recognized flag, and the journal entry id once recognized).",
    {
      scheduleId: z.string().describe("The UUID of the revenue schedule"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const found = await getRevenueSchedule(ctx.organizationId, params.scheduleId);
        if (!found) throw new Error("Revenue schedule not found");
        return { revenueSchedule: found };
      })
  );

  server.tool(
    "create_revenue_schedule",
    "Create a revenue recognition schedule (deferred revenue) for a sent/approved invoice. Immediately moves totalAmount of the invoice's income into deferred revenue (DR the income account / CR Unearned Revenue, the 2400 income-in-advance account, dated the invoice date, or today if that period is locked), then generates the periods that count it back. totalAmount is in integer cents in the invoice's currency (e.g. 120000 = 1,200.00) and can't exceed the invoice's (or line's) income before tax minus other live schedules. Methods: straight_line = one period per month from startDate to endDate, split evenly (remainder on the last), counted automatically by the daily job; milestone = the same split, but each period is only counted by hand (recognize_revenue_entry); on_completion = one period for the full amount on endDate, counted automatically. Returns the schedule with its periods and invoiceNumber.",
    {
      invoiceId: z.string().describe("UUID of the invoice (must be sent, partial, paid or overdue)"),
      invoiceLineId: z
        .string()
        .optional()
        .describe(
          "Optional invoice line UUID to spread just that line's income. Required when the invoice's lines use different income accounts."
        ),
      totalAmount: z
        .number()
        .int()
        .positive()
        .describe("Amount to spread, in integer cents in the invoice's currency"),
      startDate: z.string().describe("First period date (YYYY-MM-DD)"),
      endDate: z.string().describe("Last period date (YYYY-MM-DD); on_completion counts everything on this date"),
      method: z
        .enum(["straight_line", "milestone", "on_completion"])
        .optional()
        .default("straight_line")
        .describe("How the income is counted: straight_line (monthly, automatic), milestone (monthly split, counted by hand), on_completion (all on endDate)"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:revenue");
        const created = await createRevenueSchedule(
          { organizationId: ctx.organizationId, userId: ctx.userId, auth: ctx },
          params
        );
        return { revenueSchedule: created };
      })
  );

  server.tool(
    "recognize_revenue_entry",
    "Count the next uncounted period of an active revenue schedule as income now. Posts DR Deferred Revenue / CR the schedule's income account for that period's amount (integer cents), dated the period date (today if the period is still ahead or its date is locked), marks the period recognized, adds it to recognizedAmount and completes the schedule after the last period. Schedules created before deferral was automatic get their deferral posted first. Returns the counted period.",
    {
      scheduleId: z.string().describe("The UUID of the revenue schedule to recognize the next entry for"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:revenue");
        const entry = await recognizeNextRevenueEntry(
          { organizationId: ctx.organizationId, userId: ctx.userId, auth: ctx },
          params.scheduleId
        );
        return { revenueEntry: entry };
      })
  );

  server.tool(
    "cancel_revenue_schedule",
    "Cancel an active revenue schedule. Income not counted yet is returned to the income account (DR Deferred Revenue / CR income, dated today), so the invoice's full income stays on the books; periods already counted stay as they are. Returns the cancelled schedule.",
    {
      scheduleId: z.string().describe("The UUID of the revenue schedule to cancel"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:revenue");
        const updated = await cancelRevenueSchedule(
          { organizationId: ctx.organizationId, userId: ctx.userId, auth: ctx },
          params.scheduleId
        );
        return { revenueSchedule: updated };
      })
  );
}
