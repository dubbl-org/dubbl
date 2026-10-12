import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { employeeLeaveBalance, leavePolicy, leaveRequest, member, payrollEmployee } from "@/lib/db/schema";
import { notDeleted } from "@/lib/db/soft-delete";
import { requireRole } from "@/lib/api/require-role";
import { logAudit } from "@/lib/api/audit";
import { wrapTool } from "@/lib/mcp/errors";
import type { AuthContext } from "@/lib/api/auth-context";

/** Only the employee fields a leave list needs: never pay or bank details. */
const EMPLOYEE_COLUMNS = { id: true, name: true, employeeNumber: true, department: true, position: true } as const;

/**
 * MCP tools for time off: leave policies, requests and approvals, mirroring
 * the Payroll › Time & leave screen and the employee self-service page.
 * Hours are plain numbers (e.g. 7.5). Permission gates match the REST routes:
 * listing/creating requests needs manage:leave, approving/rejecting needs
 * approve:payroll, and requesting your own leave needs self-service:payroll.
 */
export function registerLeaveTools(server: McpServer, ctx: AuthContext) {
  server.tool(
    "list_leave_policies",
    "List the workspace's leave policies (e.g. Vacation, Sick leave): leave type, how leave accrues, accrual rate and caps. Use a policy's id as policyId when requesting leave.",
    {},
    () =>
      wrapTool(ctx, async () => {
        const policies = await db.query.leavePolicy.findMany({
          where: eq(leavePolicy.organizationId, ctx.organizationId),
          orderBy: leavePolicy.name,
        });
        return { policies };
      })
  );

  server.tool(
    "list_leave_requests",
    "List time-off requests across all employees, newest first, optionally filtered by status ('pending', 'approved', 'rejected' or 'cancelled') or employee. Each request includes its dates, hours, reason, the employee (name and number only) and the leave policy. Requires the manage:leave permission.",
    {
      status: z.enum(["pending", "approved", "rejected", "cancelled"]).optional().describe("Only requests with this status"),
      employeeId: z.string().uuid().optional().describe("Only requests from this payroll employee (UUID)"),
      limit: z.number().int().min(1).max(100).optional().default(50).describe("Requests per page (max 100)"),
      page: z.number().int().min(1).optional().default(1).describe("Page number (1-based)"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:leave");
        const conditions = [eq(leaveRequest.organizationId, ctx.organizationId)];
        if (params.status) conditions.push(eq(leaveRequest.status, params.status));
        if (params.employeeId) conditions.push(eq(leaveRequest.employeeId, params.employeeId));
        const where = and(...conditions);
        const [{ total }] = await db.select({ total: sql<number>`count(*)`.mapWith(Number) }).from(leaveRequest).where(where);
        const requests = await db.query.leaveRequest.findMany({
          where,
          orderBy: desc(leaveRequest.createdAt),
          limit: params.limit,
          offset: (params.page - 1) * params.limit,
          with: { employee: { columns: EMPLOYEE_COLUMNS }, policy: true },
        });
        return { requests, total, page: params.page, limit: params.limit };
      })
  );

  server.tool(
    "create_leave_request",
    "Record a time-off request for an employee (as a manager). It starts as 'pending' until approved or rejected. Dates are YYYY-MM-DD; hours is the total time off (e.g. 16 for two 8-hour days). Requires the manage:leave permission. Returns the created request.",
    {
      employeeId: z.string().uuid().describe("UUID of the payroll employee taking the leave"),
      policyId: z.string().uuid().describe("UUID of the leave policy (see list_leave_policies)"),
      startDate: z.string().min(1).describe("First day off, YYYY-MM-DD"),
      endDate: z.string().min(1).describe("Last day off, YYYY-MM-DD"),
      hours: z.number().min(0).describe("Total hours off, e.g. 16"),
      reason: z.string().optional().describe("Optional note, e.g. 'Family holiday'"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:leave");
        const emp = await db.query.payrollEmployee.findFirst({
          where: and(eq(payrollEmployee.id, params.employeeId), eq(payrollEmployee.organizationId, ctx.organizationId), notDeleted(payrollEmployee.deletedAt)),
          columns: { id: true },
        });
        if (!emp) throw new Error("Employee not found");
        const policy = await db.query.leavePolicy.findFirst({
          where: and(eq(leavePolicy.id, params.policyId), eq(leavePolicy.organizationId, ctx.organizationId)),
          columns: { id: true },
        });
        if (!policy) throw new Error("Leave policy not found");
        const [req] = await db
          .insert(leaveRequest)
          .values({ organizationId: ctx.organizationId, ...params })
          .returning();
        logAudit({ ctx, action: "create", entityType: "leaveRequest", entityId: req.id });
        return { request: req };
      })
  );

  server.tool(
    "request_my_leave",
    "Request time off for yourself (the signed-in user's own payroll employee record), as an employee would from self-service. Dates are YYYY-MM-DD; hours is the total time off. Requires the self-service:payroll permission. Returns the created pending request.",
    {
      policyId: z.string().uuid().describe("UUID of the leave policy (see list_leave_policies)"),
      startDate: z.string().min(1).describe("First day off, YYYY-MM-DD"),
      endDate: z.string().min(1).describe("Last day off, YYYY-MM-DD"),
      hours: z.number().min(0).describe("Total hours off, e.g. 8"),
      reason: z.string().optional().describe("Optional note for the manager"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "self-service:payroll");
        const me = await db.query.member.findFirst({
          where: and(eq(member.userId, ctx.userId), eq(member.organizationId, ctx.organizationId)),
          columns: { id: true },
        });
        if (!me) throw new Error("You're not a member of this workspace");
        const emp = await db.query.payrollEmployee.findFirst({
          where: and(eq(payrollEmployee.organizationId, ctx.organizationId), eq(payrollEmployee.memberId, me.id), notDeleted(payrollEmployee.deletedAt)),
          columns: { id: true },
        });
        if (!emp) throw new Error("Your account isn't linked to a payroll employee record");
        const [req] = await db
          .insert(leaveRequest)
          .values({ organizationId: ctx.organizationId, employeeId: emp.id, ...params })
          .returning();
        return { request: req };
      })
  );

  server.tool(
    "approve_leave_request",
    "Approve a pending time-off request. The hours are taken off the employee's balance for that leave policy this year. Requires the approve:payroll permission. Returns the updated request.",
    {
      requestId: z.string().uuid().describe("UUID of the leave request"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "approve:payroll");
        const me = await db.query.member.findFirst({
          where: and(eq(member.userId, ctx.userId), eq(member.organizationId, ctx.organizationId)),
          columns: { id: true },
        });
        if (!me) throw new Error("You're not a member of this workspace");
        const req = await db.query.leaveRequest.findFirst({
          where: and(eq(leaveRequest.id, params.requestId), eq(leaveRequest.organizationId, ctx.organizationId)),
        });
        if (!req) throw new Error("Leave request not found");
        if (req.status !== "pending") throw new Error("Only pending requests can be approved");

        const [updated] = await db
          .update(leaveRequest)
          .set({ status: "approved", approvedBy: me.id, approvedAt: new Date() })
          .where(and(eq(leaveRequest.id, req.id), eq(leaveRequest.organizationId, ctx.organizationId)))
          .returning();
        await db
          .update(employeeLeaveBalance)
          .set({
            usedHours: sql`${employeeLeaveBalance.usedHours} + ${req.hours}`,
            balance: sql`${employeeLeaveBalance.balance} - ${req.hours}`,
            updatedAt: new Date(),
          })
          .where(and(eq(employeeLeaveBalance.employeeId, req.employeeId), eq(employeeLeaveBalance.policyId, req.policyId), eq(employeeLeaveBalance.year, new Date().getFullYear())));
        logAudit({ ctx, action: "approve", entityType: "leaveRequest", entityId: req.id });
        return { request: updated };
      })
  );

  server.tool(
    "reject_leave_request",
    "Reject a pending time-off request, optionally saying why (the employee sees the reason). Requires the approve:payroll permission. Returns the updated request.",
    {
      requestId: z.string().uuid().describe("UUID of the leave request"),
      reason: z.string().optional().describe("Why the request was turned down"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "approve:payroll");
        const req = await db.query.leaveRequest.findFirst({
          where: and(eq(leaveRequest.id, params.requestId), eq(leaveRequest.organizationId, ctx.organizationId)),
        });
        if (!req) throw new Error("Leave request not found");
        if (req.status !== "pending") throw new Error("Only pending requests can be rejected");
        const [updated] = await db
          .update(leaveRequest)
          .set({ status: "rejected", rejectionReason: params.reason || null })
          .where(and(eq(leaveRequest.id, req.id), eq(leaveRequest.organizationId, ctx.organizationId)))
          .returning();
        logAudit({ ctx, action: "reject", entityType: "leaveRequest", entityId: req.id });
        return { request: updated };
      })
  );
}
