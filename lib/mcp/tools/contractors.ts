import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db } from "@/lib/db";
import { contractor, contractorPayment } from "@/lib/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { notDeleted } from "@/lib/db/soft-delete";
import { requireRole } from "@/lib/api/require-role";
import { logAudit } from "@/lib/api/audit";
import { wrapTool } from "@/lib/mcp/errors";
import { currencyCodeSchema } from "@/lib/currency/zod";
import { AuthError, type AuthContext } from "@/lib/api/auth-context";

/** Loads a live contractor of this org, or throws a not-found error. */
async function findContractor(ctx: AuthContext, contractorId: string) {
  const c = await db.query.contractor.findFirst({
    where: and(
      eq(contractor.id, contractorId),
      eq(contractor.organizationId, ctx.organizationId),
      notDeleted(contractor.deletedAt)
    ),
  });
  if (!c) throw new AuthError("Contractor not found", 404);
  return c;
}

export function registerContractorTools(server: McpServer, ctx: AuthContext) {
  server.tool(
    "list_contractors",
    "List contractors (freelancers paid outside payroll) for the organization. Returns id, name, email, company, hourlyRate (integer cents per hour, or null), currency and isActive. Tax IDs and bank numbers are not included; use get_contractor for those.",
    {
      active: z
        .boolean()
        .optional()
        .describe("true = only active contractors, false = only inactive. Omit for all."),
      limit: z.number().int().min(1).max(200).optional().default(50).describe("Max rows to return (max 200)"),
      page: z.number().int().min(1).optional().default(1).describe("Page number (1-based)"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:contractors");
        const conditions = [
          eq(contractor.organizationId, ctx.organizationId),
          notDeleted(contractor.deletedAt),
        ];
        if (params.active === true) conditions.push(eq(contractor.isActive, true));
        if (params.active === false) conditions.push(eq(contractor.isActive, false));

        const rows = await db.query.contractor.findMany({
          where: and(...conditions),
          orderBy: desc(contractor.createdAt),
          columns: { taxId: false, bankAccountNumber: false },
          limit: params.limit,
          offset: (params.page - 1) * params.limit,
        });
        const [countResult] = await db
          .select({ count: sql<number>`count(*)`.mapWith(Number) })
          .from(contractor)
          .where(and(...conditions));

        return { contractors: rows, total: Number(countResult?.count ?? 0), page: params.page, limit: params.limit };
      })
  );

  server.tool(
    "get_contractor",
    "Get one contractor with all details (including taxId, used on 1099-NEC forms, and bank account number) and their payments. hourlyRate and payment amounts are integer cents.",
    {
      contractorId: z.string().uuid().describe("Contractor id (from list_contractors)"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:contractors");
        const c = await db.query.contractor.findFirst({
          where: and(
            eq(contractor.id, params.contractorId),
            eq(contractor.organizationId, ctx.organizationId),
            notDeleted(contractor.deletedAt)
          ),
          with: { payments: true },
        });
        if (!c) throw new AuthError("Contractor not found", 404);
        return { contractor: c };
      })
  );

  server.tool(
    "create_contractor",
    "Create a contractor. Only name is required. hourlyRate is in integer cents per hour (e.g. $150.00/hr = 15000). taxId is the EIN or SSN printed on the contractor's 1099-NEC. Returns the created contractor.",
    {
      name: z.string().min(1).describe("Contractor's full name"),
      email: z.string().email().optional().describe("Contact email (optional)"),
      company: z.string().optional().describe("Company or trading name (optional)"),
      taxId: z.string().optional().describe("Tax ID (EIN or SSN) used on 1099-NEC forms (optional)"),
      hourlyRate: z.number().int().min(0).optional().describe("Hourly rate in integer cents (e.g. 15000 = $150.00/hr)"),
      currency: currencyCodeSchema.optional().describe("ISO 4217 currency code, defaults to USD"),
      bankAccountNumber: z.string().optional().describe("Bank account number for payouts (optional)"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:contractors");
        const [c] = await db
          .insert(contractor)
          .values({ organizationId: ctx.organizationId, ...params })
          .returning();
        await logAudit({ ctx, action: "create", entityType: "contractor", entityId: c.id });
        return { contractor: c };
      })
  );

  server.tool(
    "update_contractor",
    "Update a contractor. Pass only the fields to change; pass null to clear an optional field. hourlyRate is in integer cents per hour. Set isActive false to mark the contractor inactive. Returns the updated contractor.",
    {
      contractorId: z.string().uuid().describe("Contractor id to update"),
      name: z.string().min(1).optional().describe("New name"),
      email: z.string().email().nullable().optional().describe("New email, or null to clear"),
      company: z.string().nullable().optional().describe("New company name, or null to clear"),
      taxId: z.string().nullable().optional().describe("New tax ID (EIN or SSN for 1099-NEC), or null to clear"),
      hourlyRate: z.number().int().min(0).nullable().optional().describe("New hourly rate in integer cents, or null to clear"),
      currency: currencyCodeSchema.optional().describe("New ISO 4217 currency code"),
      bankAccountNumber: z.string().nullable().optional().describe("New bank account number, or null to clear"),
      isActive: z.boolean().optional().describe("false to mark inactive, true to reactivate"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:contractors");
        const { contractorId, ...changes } = params;
        const [updated] = await db
          .update(contractor)
          .set({ ...changes, updatedAt: new Date() })
          .where(and(
            eq(contractor.id, contractorId),
            eq(contractor.organizationId, ctx.organizationId),
            notDeleted(contractor.deletedAt)
          ))
          .returning();
        if (!updated) throw new AuthError("Contractor not found", 404);
        await logAudit({ ctx, action: "update", entityType: "contractor", entityId: contractorId, changes });
        return { contractor: updated };
      })
  );

  server.tool(
    "list_contractor_payments",
    "List a contractor's payments, newest first. Each payment has amount (integer cents), currency, description, invoiceNumber, period dates, status ('pending' = to pay, 'paid', 'void') and paidAt.",
    {
      contractorId: z.string().uuid().describe("Contractor id"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:contractors");
        await findContractor(ctx, params.contractorId);
        const payments = await db.query.contractorPayment.findMany({
          where: eq(contractorPayment.contractorId, params.contractorId),
          orderBy: desc(contractorPayment.createdAt),
        });
        return { payments };
      })
  );

  server.tool(
    "create_contractor_payment",
    "Record a payment owed to a contractor with status 'pending' (to pay). It posts nothing to the books; processing the payment (in the app) posts the journal entry and marks it paid. amount is integer cents (e.g. $1,200.00 = 120000). Returns the created payment.",
    {
      contractorId: z.string().uuid().describe("Contractor id"),
      amount: z.number().int().min(1).describe("Amount in integer cents (e.g. 120000 = $1,200.00)"),
      currency: currencyCodeSchema.optional().describe("ISO 4217 currency code; defaults to the contractor's currency"),
      description: z.string().optional().describe("What the payment is for (optional)"),
      invoiceNumber: z.string().optional().describe("The contractor's invoice number (optional)"),
      periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Start of the work period, YYYY-MM-DD (optional)"),
      periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("End of the work period, YYYY-MM-DD (optional)"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:contractors");
        const c = await findContractor(ctx, params.contractorId);
        const [payment] = await db
          .insert(contractorPayment)
          .values({ ...params, currency: params.currency ?? c.currency ?? "USD" })
          .returning();
        await logAudit({ ctx, action: "create", entityType: "contractorPayment", entityId: payment.id });
        return { payment };
      })
  );
}
