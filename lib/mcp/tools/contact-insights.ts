import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { requireRole } from "@/lib/api/require-role";
import { wrapTool } from "@/lib/mcp/errors";
import { AuthError, type AuthContext } from "@/lib/api/auth-context";
import { listContactBalances, type BalanceSide } from "@/lib/api/contact-balances";
import { findDuplicateContacts } from "@/lib/api/contact-duplicates";
import { buildContactStatement, emailContactStatement, StatementError } from "@/lib/api/contact-statement";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Balances, statements and duplicate detection for customers and suppliers. */
export function registerContactInsightTools(server: McpServer, ctx: AuthContext) {
  const balanceParams = {
    search: z.string().optional().describe("Filter by contact name or email"),
    openOnly: z.boolean().optional().default(false).describe("Only contacts that still have an unpaid balance"),
    limit: z.number().int().min(1).max(100).optional().default(50).describe("Number of contacts to return (max 100)"),
    page: z.number().int().min(1).optional().default(1).describe("Page number, starting at 1"),
  };
  const balances = (side: BalanceSide) => (params: { search?: string; openOnly: boolean; limit: number; page: number }) =>
    wrapTool(ctx, async () => {
      const { rows, total } = await listContactBalances(ctx.organizationId, side, {
        search: params.search,
        openOnly: params.openOnly,
        limit: params.limit,
        offset: (params.page - 1) * params.limit,
      });
      return { contacts: rows, total, page: params.page, limit: params.limit };
    });

  server.tool(
    "list_customer_balances",
    "List customers (type customer or both) with what they owe you. Per customer: outstanding (unpaid invoices), overdue, openCount, overdueCount, oldestOverdueDate, aging buckets (current, d1to30, d31to60, d61to90, over90), totalThisYear and totalLastYear (invoiced), lastDocumentDate (last invoice), lastPaymentDate, paidCount, avgDaysToPay (days from issue to payment on paid invoices), unappliedCredit (prepayments held on account), hasPortalAccess, paymentTermsDays, creditLimit. All amounts are integer cents. Sorted by name; returns { contacts, total, page, limit }.",
    balanceParams,
    balances("customer")
  );

  server.tool(
    "list_supplier_balances",
    "List suppliers (type supplier or both) with what you owe them. Per supplier: outstanding (unpaid bills), overdue, openCount, overdueCount, oldestOverdueDate, aging buckets (current, d1to30, d31to60, d61to90, over90), totalThisYear and totalLastYear (billed spend), lastDocumentDate (last bill), lastPaymentDate, paidCount, avgDaysToPay, is1099Vendor, paymentTermsDays. All amounts are integer cents. Sorted by name; returns { contacts, total, page, limit }.",
    balanceParams,
    balances("supplier")
  );

  server.tool(
    "find_duplicate_contacts",
    "Find contacts that are probably entered twice: the same normalised name (case, punctuation and legal suffixes like Inc/LLC/Ltd ignored), the same email, or the same tax number. Returns groups, strongest evidence first; each group has reasons, matched values (tax numbers masked to the last 4), suggestedKeepId (the member with most records) and members with their invoice/bill/quote/payment counts and unpaid balances owesYou/youOwe in integer cents. Combine a pair with merge_contacts (sourceContactId = the duplicate, targetContactId = the one to keep).",
    {},
    () =>
      wrapTool(ctx, async () => {
        const groups = await findDuplicateContacts(ctx.organizationId);
        return { groups, totalGroups: groups.length };
      })
  );

  server.tool(
    "get_contact_statement",
    "Get the account statement for a customer or supplier over a date range (default: the last 12 months): opening balance, every invoice, credit note, bill, debit note and payment with debit/credit and a running balance, and the closing balance. For customers a positive balance means they owe you. All amounts are integer cents.",
    {
      contactId: z.string().uuid().describe("The contact to build the statement for"),
      startDate: dateSchema.optional().describe("First day of the statement, YYYY-MM-DD (default: 12 months ago)"),
      endDate: dateSchema.optional().describe("Last day of the statement, YYYY-MM-DD (default: today)"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const statement = await buildContactStatement(ctx.organizationId, params.contactId, params.startDate, params.endDate);
        if (!statement) throw new AuthError("Contact not found", 404);
        return { statement };
      })
  );

  server.tool(
    "email_contact_statement",
    "Email a contact their account statement for a date range (default: the last 12 months) to the contact's email address, using the workspace's SMTP settings. Fails if the contact has no email or email isn't configured. Requires manage:contacts. Returns { sentTo, startDate, endDate, closingBalance } with closingBalance in integer cents.",
    {
      contactId: z.string().uuid().describe("The contact to send the statement to"),
      startDate: dateSchema.optional().describe("First day of the statement, YYYY-MM-DD (default: 12 months ago)"),
      endDate: dateSchema.optional().describe("Last day of the statement, YYYY-MM-DD (default: today)"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:contacts");
        try {
          return await emailContactStatement(ctx.organizationId, params.contactId, params.startDate, params.endDate);
        } catch (err) {
          if (err instanceof StatementError) throw new AuthError(err.message, err.status);
          throw err;
        }
      })
  );
}
