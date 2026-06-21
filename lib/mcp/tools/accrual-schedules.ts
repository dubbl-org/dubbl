import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  accrualSchedule,
  accrualEntry,
  journalEntry,
  journalLine,
} from "@/lib/db/schema";
import { eq, and, desc, asc, sql } from "drizzle-orm";
import { requireRole } from "@/lib/api/require-role";
import { getNextEntryNumber } from "@/lib/api/journal-automation";
import { wrapTool } from "@/lib/mcp/errors";
import type { AuthContext } from "@/lib/api/auth-context";

/**
 * MCP tools for accrual schedules: spreading a cost or income amount evenly
 * across a number of monthly periods, then posting each period as a reversing
 * journal entry (DR reverseAccount / CR account).
 *
 * IMPORTANT: All monetary amounts (totalAmount, per-period amounts) are integer
 * minor units (cents) on both INPUT and OUTPUT. The REST route accepts dollars
 * and multiplies by 100; these tools instead accept cents directly and run the
 * SAME per-period split math on the cents value (no *100). Direct DB access via
 * Drizzle (no HTTP self-calls); everything org-scoped via ctx.organizationId.
 */
export function registerAccrualScheduleTools(server: McpServer, ctx: AuthContext) {
  server.tool(
    "list_accrual_schedules",
    "List accrual schedules (cost/income spread evenly across monthly periods) with their generated period entries. Optionally filter by status. totalAmount and each entry's amount are in integer cents.",
    {
      status: z
        .enum(["active", "completed", "cancelled"])
        .optional()
        .describe("Filter by schedule status (active, completed, or cancelled)"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .default(50)
        .describe("Number of schedules to return (max 100)"),
      page: z.number().int().min(1).optional().default(1).describe("Page number (1-based)"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const conditions = [eq(accrualSchedule.organizationId, ctx.organizationId)];
        if (params.status) conditions.push(eq(accrualSchedule.status, params.status));

        const offset = (params.page - 1) * params.limit;
        const schedules = await db.query.accrualSchedule.findMany({
          where: and(...conditions),
          orderBy: desc(accrualSchedule.createdAt),
          limit: params.limit,
          offset,
          with: { entries: true },
        });

        const [countResult] = await db
          .select({ count: sql<number>`count(*)`.mapWith(Number) })
          .from(accrualSchedule)
          .where(and(...conditions));

        return { accrualSchedules: schedules, total: Number(countResult?.count || 0) };
      })
  );

  server.tool(
    "get_accrual_schedule",
    "Get a single accrual schedule by ID, including its generated period entries (with each period's date, amount in integer cents, posted flag, and journal entry ID once posted).",
    {
      scheduleId: z.string().describe("The UUID of the accrual schedule"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const found = await db.query.accrualSchedule.findFirst({
          where: and(
            eq(accrualSchedule.id, params.scheduleId),
            eq(accrualSchedule.organizationId, ctx.organizationId)
          ),
          with: {
            entries: { orderBy: asc(accrualEntry.sortOrder) },
            account: true,
            reverseAccount: true,
          },
        });
        if (!found) throw new Error("Accrual schedule not found");
        return { accrualSchedule: found };
      })
  );

  server.tool(
    "create_accrual_schedule",
    "Create an accrual schedule that spreads totalAmount evenly across the given number of monthly periods, generating one unposted period entry per period. totalAmount is in integer cents (e.g. 120000 = $1,200.00). The split uses floor division: each period gets floor(totalAmount / periods) and the LAST period absorbs the rounding remainder so the entries sum exactly to totalAmount. Period dates start at startDate and advance one calendar month each. Use post_accrual_entry to post each period as a reversing journal (DR reverseAccountId / CR accountId). Returns the created schedule with its entries.",
    {
      sourceEntryId: z
        .string()
        .optional()
        .describe("Optional UUID of the source journal entry this accrual originates from"),
      totalAmount: z
        .number()
        .int()
        .positive()
        .describe("Total amount to spread across all periods, in integer cents"),
      startDate: z.string().describe("Date of the first period (YYYY-MM-DD)"),
      endDate: z.string().describe("Date the schedule ends (YYYY-MM-DD)"),
      periods: z
        .number()
        .int()
        .positive()
        .describe("Number of monthly periods to spread the total across"),
      accountId: z
        .string()
        .describe("Chart-account UUID credited each period (the account being spread)"),
      reverseAccountId: z
        .string()
        .describe("Chart-account UUID debited each period (the offsetting/reversing account)"),
      description: z.string().describe("Description of the accrual schedule"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:accruals");

        // Mirror the route's split math, but on the cents value we receive
        // directly (the route multiplies an incoming dollar amount by 100; we
        // do NOT — totalAmount is already integer cents).
        const totalAmountCents = params.totalAmount;
        const perPeriod = Math.floor(totalAmountCents / params.periods);
        const remainder = totalAmountCents - perPeriod * (params.periods - 1);

        const [schedule] = await db
          .insert(accrualSchedule)
          .values({
            organizationId: ctx.organizationId,
            sourceEntryId: params.sourceEntryId || null,
            totalAmount: totalAmountCents,
            startDate: params.startDate,
            endDate: params.endDate,
            periods: params.periods,
            accountId: params.accountId,
            reverseAccountId: params.reverseAccountId,
            description: params.description,
            createdBy: ctx.userId,
          })
          .returning();

        // Generate period entries (one per month from startDate).
        const entries = [];
        const start = new Date(params.startDate);
        for (let i = 0; i < params.periods; i++) {
          const periodDate = new Date(start);
          periodDate.setMonth(periodDate.getMonth() + i);
          const amount = i === params.periods - 1 ? remainder : perPeriod;
          entries.push({
            scheduleId: schedule.id,
            periodDate: periodDate.toISOString().split("T")[0],
            amount,
            sortOrder: i,
          });
        }

        await db.insert(accrualEntry).values(entries);

        const result = await db.query.accrualSchedule.findFirst({
          where: eq(accrualSchedule.id, schedule.id),
          with: { entries: { orderBy: asc(accrualEntry.sortOrder) } },
        });

        return { accrualSchedule: result };
      })
  );

  server.tool(
    "post_accrual_entry",
    "Post the next unposted period of an accrual schedule as a reversing journal entry: DR reverseAccountId / CR accountId for that period's amount (in integer cents). Marks the period entry as posted and links its journal entry. When the last unposted period is posted, the schedule's status flips to 'completed'. The schedule must be 'active'. Returns the posted period entry.",
    {
      scheduleId: z.string().describe("The UUID of the accrual schedule to post the next period for"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:accruals");

        const schedule = await db.query.accrualSchedule.findFirst({
          where: and(
            eq(accrualSchedule.id, params.scheduleId),
            eq(accrualSchedule.organizationId, ctx.organizationId)
          ),
          with: {
            entries: { orderBy: asc(accrualEntry.sortOrder) },
          },
        });
        if (!schedule) throw new Error("Accrual schedule not found");
        if (schedule.status !== "active") throw new Error("Schedule is not active");

        // Find first unposted entry.
        const nextEntry = schedule.entries.find((e) => !e.posted);
        if (!nextEntry) throw new Error("All entries have already been posted");

        const updatedEntry = await db.transaction(async (tx) => {
          // Pass the surrounding tx so concurrent posts don't collide on
          // entry_number.
          const entryNumber = await getNextEntryNumber(ctx.organizationId, tx);

          const [je] = await tx
            .insert(journalEntry)
            .values({
              organizationId: ctx.organizationId,
              entryNumber,
              date: nextEntry.periodDate,
              description: `Accrual: ${schedule.description} - Period ${nextEntry.sortOrder + 1}`,
              status: "posted",
              sourceType: "accrual",
              sourceId: schedule.id,
              createdBy: ctx.userId,
              postedAt: new Date(),
            })
            .returning();

          await tx.insert(journalLine).values([
            {
              journalEntryId: je.id,
              accountId: schedule.reverseAccountId,
              description: schedule.description,
              debitAmount: nextEntry.amount,
              creditAmount: 0,
            },
            {
              journalEntryId: je.id,
              accountId: schedule.accountId,
              description: schedule.description,
              debitAmount: 0,
              creditAmount: nextEntry.amount,
            },
          ]);

          await tx
            .update(accrualEntry)
            .set({ posted: true, journalEntryId: je.id })
            .where(eq(accrualEntry.id, nextEntry.id));

          // Mark the schedule completed once this was the last unposted entry.
          const unpostedCount = schedule.entries.filter(
            (e) => !e.posted && e.id !== nextEntry.id
          ).length;
          if (unpostedCount === 0) {
            await tx
              .update(accrualSchedule)
              .set({ status: "completed", updatedAt: new Date() })
              .where(eq(accrualSchedule.id, schedule.id));
          }

          const [row] = await tx
            .select()
            .from(accrualEntry)
            .where(eq(accrualEntry.id, nextEntry.id));
          return row;
        });

        return { accrualEntry: updatedEntry };
      })
  );

  server.tool(
    "cancel_accrual_schedule",
    "Cancel an accrual schedule, setting its status to 'cancelled' so no further periods can be posted. Already-posted period journals are left intact. Fails if every period entry has already been posted (nothing left to cancel). Returns the updated schedule.",
    {
      scheduleId: z.string().describe("The UUID of the accrual schedule to cancel"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:accruals");

        const schedule = await db.query.accrualSchedule.findFirst({
          where: and(
            eq(accrualSchedule.id, params.scheduleId),
            eq(accrualSchedule.organizationId, ctx.organizationId)
          ),
          with: { entries: true },
        });
        if (!schedule) throw new Error("Accrual schedule not found");

        const allPosted = schedule.entries.every((e) => e.posted);
        if (allPosted && schedule.entries.length > 0) {
          throw new Error("Cannot cancel a schedule where all entries are already posted");
        }

        const [updated] = await db
          .update(accrualSchedule)
          .set({ status: "cancelled", updatedAt: new Date() })
          .where(eq(accrualSchedule.id, params.scheduleId))
          .returning();

        return { accrualSchedule: updated };
      })
  );
}
