import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  revenueSchedule,
  revenueEntry,
  journalEntry,
  journalLine,
  chartAccount,
} from "@/lib/db/schema";
import { eq, and, desc, asc, sql } from "drizzle-orm";
import { requireRole } from "@/lib/api/require-role";
import { getNextEntryNumber } from "@/lib/api/journal-automation";
import { wrapTool } from "@/lib/mcp/errors";
import type { AuthContext } from "@/lib/api/auth-context";

/**
 * MCP tools for revenue recognition schedules (deferred revenue).
 *
 * A revenue schedule splits an invoiced amount across periods and recognizes
 * each period over time: DR Deferred Revenue (2300) / CR Revenue (the invoice
 * line's revenue account, or 4000 by default).
 *
 * IMPORTANT: All monetary amounts here are integer minor units (cents). The
 * REST route receives totalAmount in DOLLARS and multiplies by 100; this MCP
 * tool instead ACCEPTS integer cents and stores them directly (no *100). The
 * per-period split math is otherwise identical to the route. Direct DB access
 * via Drizzle, org-scoped via ctx.organizationId (no HTTP self-calls).
 */
export function registerRevenueScheduleTools(server: McpServer, ctx: AuthContext) {
  server.tool(
    "list_revenue_schedules",
    "List revenue recognition schedules (deferred revenue) with optional status filter and pagination. Each schedule includes its generated period entries. Amounts (totalAmount, recognizedAmount, each entry's amount) are in integer cents.",
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
          with: { entries: true },
        });
        const [countResult] = await db
          .select({ count: sql<number>`count(*)`.mapWith(Number) })
          .from(revenueSchedule)
          .where(and(...conditions));

        return { revenueSchedules: schedules, total: Number(countResult?.count || 0) };
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
        const found = await db.query.revenueSchedule.findFirst({
          where: and(
            eq(revenueSchedule.id, params.scheduleId),
            eq(revenueSchedule.organizationId, ctx.organizationId)
          ),
          with: { entries: { orderBy: asc(revenueEntry.sortOrder) } },
        });
        if (!found) throw new Error("Revenue schedule not found");
        return { revenueSchedule: found };
      })
  );

  server.tool(
    "create_revenue_schedule",
    "Create a revenue recognition schedule (deferred revenue) for an invoice and generate its period entries. totalAmount is in integer cents (e.g. 120000 = $1,200.00) and is split evenly across the whole months from startDate to endDate inclusive, with the remainder added to the final period (straight-line math is used to generate entries regardless of method). The schedule starts 'active'. Returns the created schedule with its generated entries.",
    {
      invoiceId: z.string().describe("Invoice UUID this schedule recognizes revenue for"),
      invoiceLineId: z
        .string()
        .optional()
        .describe(
          "Optional invoice line UUID; when set, that line's revenue account is credited at recognition time (otherwise default revenue account 4000)"
        ),
      totalAmount: z
        .number()
        .int()
        .positive()
        .describe("Total amount to recognize over the schedule, in integer cents"),
      startDate: z.string().describe("First period date (YYYY-MM-DD)"),
      endDate: z.string().describe("Last period date (YYYY-MM-DD)"),
      method: z
        .enum(["straight_line", "milestone", "on_completion"])
        .optional()
        .default("straight_line")
        .describe("Recognition method; defaults to straight_line"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:revenue");

        // MCP receives integer cents directly (route would *100 a dollar value).
        const totalAmountCents = params.totalAmount;

        // Calculate months between start and end (inclusive), same as the route.
        const start = new Date(params.startDate);
        const end = new Date(params.endDate);
        const months =
          (end.getFullYear() - start.getFullYear()) * 12 +
          (end.getMonth() - start.getMonth()) +
          1;

        const periods = Math.max(1, months);
        const perPeriod = Math.floor(totalAmountCents / periods);
        const remainder = totalAmountCents - perPeriod * (periods - 1);

        const [schedule] = await db
          .insert(revenueSchedule)
          .values({
            organizationId: ctx.organizationId,
            invoiceId: params.invoiceId,
            invoiceLineId: params.invoiceLineId || null,
            totalAmount: totalAmountCents,
            startDate: params.startDate,
            endDate: params.endDate,
            method: params.method,
            createdBy: ctx.userId,
          })
          .returning();

        const entries = [];
        for (let i = 0; i < periods; i++) {
          const periodDate = new Date(start);
          periodDate.setMonth(periodDate.getMonth() + i);
          const amount = i === periods - 1 ? remainder : perPeriod;
          entries.push({
            scheduleId: schedule.id,
            periodDate: periodDate.toISOString().split("T")[0],
            amount,
            sortOrder: i,
          });
        }

        await db.insert(revenueEntry).values(entries);

        const result = await db.query.revenueSchedule.findFirst({
          where: eq(revenueSchedule.id, schedule.id),
          with: { entries: { orderBy: asc(revenueEntry.sortOrder) } },
        });

        return { revenueSchedule: result };
      })
  );

  server.tool(
    "recognize_revenue_entry",
    "Recognize the next unrecognized period of a revenue schedule. Posts a journal entry DR Deferred Revenue (2300) / CR Revenue (the invoice line's revenue account if the schedule has an invoiceLineId, otherwise default revenue account 4000) for that period's amount, marks the entry recognized, increments the schedule's recognizedAmount, and sets the schedule to 'completed' once the last period is recognized. The schedule must be 'active'. Returns the recognized entry.",
    {
      scheduleId: z.string().describe("The UUID of the revenue schedule to recognize the next entry for"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:revenue");

        const schedule = await db.query.revenueSchedule.findFirst({
          where: and(
            eq(revenueSchedule.id, params.scheduleId),
            eq(revenueSchedule.organizationId, ctx.organizationId)
          ),
          with: {
            entries: { orderBy: asc(revenueEntry.sortOrder) },
            invoice: { with: { lines: true } },
          },
        });
        if (!schedule) throw new Error("Revenue schedule not found");
        if (schedule.status !== "active") throw new Error("Schedule is not active");

        const nextEntry = schedule.entries.find((e) => !e.recognized);
        if (!nextEntry) throw new Error("All entries have already been recognized");

        // Determine revenue (credit) account: invoice line's account if set,
        // otherwise the default revenue account "4000".
        let revenueAccountId: string | null = null;
        if (schedule.invoiceLineId) {
          const line = schedule.invoice?.lines?.find(
            (l) => l.id === schedule.invoiceLineId
          );
          if (line?.accountId) revenueAccountId = line.accountId;
        }
        if (!revenueAccountId) {
          const revenueAccount = await db.query.chartAccount.findFirst({
            where: and(
              eq(chartAccount.organizationId, ctx.organizationId),
              eq(chartAccount.code, "4000")
            ),
          });
          if (revenueAccount) revenueAccountId = revenueAccount.id;
        }

        // Deferred revenue (debit) account "2300".
        const deferredAccount = await db.query.chartAccount.findFirst({
          where: and(
            eq(chartAccount.organizationId, ctx.organizationId),
            eq(chartAccount.code, "2300")
          ),
        });
        if (!deferredAccount)
          throw new Error(
            "Deferred Revenue account (2300) not found. Please create it first."
          );
        if (!revenueAccountId)
          throw new Error("Revenue account (4000) not found. Please create it first.");

        const updatedEntry = await db.transaction(async (tx) => {
          // Pass the surrounding tx so concurrent entries don't collide on entry_number.
          const entryNumber = await getNextEntryNumber(ctx.organizationId, tx);
          const description = `Revenue Recognition - Period ${nextEntry.sortOrder + 1}`;

          const [je] = await tx
            .insert(journalEntry)
            .values({
              organizationId: ctx.organizationId,
              entryNumber,
              date: nextEntry.periodDate,
              description,
              status: "posted",
              sourceType: "revenue_recognition",
              sourceId: schedule.id,
              createdBy: ctx.userId,
              postedAt: new Date(),
            })
            .returning();

          await tx.insert(journalLine).values([
            {
              journalEntryId: je.id,
              accountId: deferredAccount.id,
              description,
              debitAmount: nextEntry.amount,
              creditAmount: 0,
            },
            {
              journalEntryId: je.id,
              accountId: revenueAccountId!,
              description,
              debitAmount: 0,
              creditAmount: nextEntry.amount,
            },
          ]);

          await tx
            .update(revenueEntry)
            .set({ recognized: true, journalEntryId: je.id })
            .where(eq(revenueEntry.id, nextEntry.id));

          const newRecognizedAmount = schedule.recognizedAmount + nextEntry.amount;
          const updateData: {
            recognizedAmount: number;
            updatedAt: Date;
            status?: "completed" | "active" | "cancelled";
          } = {
            recognizedAmount: newRecognizedAmount,
            updatedAt: new Date(),
          };

          const unrecognizedCount = schedule.entries.filter(
            (e) => !e.recognized && e.id !== nextEntry.id
          ).length;
          if (unrecognizedCount === 0) updateData.status = "completed";

          await tx
            .update(revenueSchedule)
            .set(updateData)
            .where(eq(revenueSchedule.id, schedule.id));

          const [row] = await tx
            .select()
            .from(revenueEntry)
            .where(eq(revenueEntry.id, nextEntry.id));
          return row;
        });

        return { revenueEntry: updatedEntry };
      })
  );

  server.tool(
    "cancel_revenue_schedule",
    "Cancel a revenue recognition schedule, setting its status to 'cancelled'. Cannot cancel a schedule where every entry has already been recognized. Already-posted recognition journal entries are left untouched. Returns the cancelled schedule.",
    {
      scheduleId: z.string().describe("The UUID of the revenue schedule to cancel"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:revenue");

        const schedule = await db.query.revenueSchedule.findFirst({
          where: and(
            eq(revenueSchedule.id, params.scheduleId),
            eq(revenueSchedule.organizationId, ctx.organizationId)
          ),
          with: { entries: true },
        });
        if (!schedule) throw new Error("Revenue schedule not found");

        const allRecognized = schedule.entries.every((e) => e.recognized);
        if (allRecognized && schedule.entries.length > 0)
          throw new Error(
            "Cannot cancel a schedule where all entries are already recognized"
          );

        const [updated] = await db
          .update(revenueSchedule)
          .set({ status: "cancelled", updatedAt: new Date() })
          .where(eq(revenueSchedule.id, params.scheduleId))
          .returning();

        return { revenueSchedule: updated };
      })
  );
}
