import { db } from "@/lib/db";
import { invoice, contact, inventoryItem, bankTransaction, bankAccount } from "@/lib/db/schema";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { notDeleted } from "@/lib/db/soft-delete";
import { ok, handleError, validationError } from "@/lib/api/response";
import { z } from "zod";

const runSchema = z.object({
  dataSource: z.enum(["invoices", "expenses", "transactions", "payroll", "inventory", "contacts"]),
  filters: z.array(z.object({ field: z.string(), operator: z.string(), value: z.string() })).default([]),
  groupBy: z.array(z.string()).default([]),
  columns: z.array(z.string()).min(1),
  dateRange: z.object({ from: z.string(), to: z.string() }).optional(),
});

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const body = await request.json();
    const config = runSchema.parse(body);

    let rows: Record<string, unknown>[] = [];

    switch (config.dataSource) {
      case "invoices": {
        const all = await db.query.invoice.findMany({
          where: and(
            eq(invoice.organizationId, ctx.organizationId),
            notDeleted(invoice.deletedAt)
          ),
          with: { contact: true },
          orderBy: desc(invoice.createdAt),
        });
        rows = all.map((inv) => ({
          id: inv.id,
          invoiceNumber: inv.invoiceNumber,
          contactName: inv.contact?.name || "-",
          status: inv.status,
          issueDate: inv.issueDate,
          dueDate: inv.dueDate,
          subtotal: inv.subtotal,
          taxTotal: inv.taxTotal,
          total: inv.total,
          amountPaid: inv.amountPaid,
          amountDue: inv.amountDue,
          currencyCode: inv.currencyCode,
        }));
        break;
      }

      case "contacts": {
        const all = await db.query.contact.findMany({
          where: and(
            eq(contact.organizationId, ctx.organizationId),
            notDeleted(contact.deletedAt)
          ),
        });
        rows = all.map((c) => ({
          id: c.id,
          name: c.name,
          email: c.email,
          type: c.type,
          phone: c.phone,
          paymentTermsDays: c.paymentTermsDays,
          creditLimit: c.creditLimit,
        }));
        break;
      }

      case "inventory": {
        const all = await db.query.inventoryItem.findMany({
          where: and(
            eq(inventoryItem.organizationId, ctx.organizationId),
            notDeleted(inventoryItem.deletedAt)
          ),
        });
        rows = all.map((i) => ({
          id: i.id,
          code: i.code,
          name: i.name,
          category: i.category,
          purchasePrice: i.purchasePrice,
          salePrice: i.salePrice,
          quantityOnHand: i.quantityOnHand,
          reorderPoint: i.reorderPoint,
          isActive: i.isActive,
        }));
        break;
      }

      case "transactions": {
        const orgAccounts = await db.query.bankAccount.findMany({
          where: eq(bankAccount.organizationId, ctx.organizationId),
          columns: { id: true },
        });
        const accountIds = orgAccounts.map((a) => a.id);
        if (accountIds.length > 0) {
          const { inArray } = await import("drizzle-orm");
          const all = await db.query.bankTransaction.findMany({
            where: inArray(bankTransaction.bankAccountId, accountIds),
            orderBy: desc(bankTransaction.date),
          });
          rows = all.map((t) => ({
            id: t.id,
            date: t.date,
            description: t.description,
            amount: t.amount,
            status: t.status,
            payee: t.payee,
          }));
        }
        break;
      }

      default:
        return validationError(`Data source "${config.dataSource}" not yet supported for custom reports`);
    }

    // Apply date range filter
    if (config.dateRange) {
      const { from, to } = config.dateRange;
      rows = rows.filter((r) => {
        const date = (r.issueDate || r.date || "") as string;
        if (!date) return true;
        return date >= from && date <= to;
      });
    }

    // Apply filters
    for (const filter of config.filters) {
      rows = rows.filter((r) => {
        const val = String(r[filter.field] || "");
        switch (filter.operator) {
          case "equals": return val === filter.value;
          case "contains": return val.toLowerCase().includes(filter.value.toLowerCase());
          case "gt": return Number(val) > Number(filter.value);
          case "lt": return Number(val) < Number(filter.value);
          case "gte": return Number(val) >= Number(filter.value);
          case "lte": return Number(val) <= Number(filter.value);
          default: return true;
        }
      });
    }

    // Select columns
    const projected = rows.map((r) => {
      const out: Record<string, unknown> = {};
      for (const col of config.columns) {
        out[col] = r[col];
      }
      return out;
    });

    return ok({ data: projected, total: projected.length });
  } catch (err) {
    return handleError(err);
  }
}
