import { db } from "@/lib/db";
import { invoice, bill, bankAccount, inventoryItem } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { notDeleted } from "@/lib/db/soft-delete";
import { ok, error, handleError } from "@/lib/api/response";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ type: string }> }
) {
  try {
    const { type } = await params;
    const ctx = await getAuthContext(request);

    switch (type) {
      case "accounts_receivable": {
        const invoices = await db.query.invoice.findMany({
          where: and(
            eq(invoice.organizationId, ctx.organizationId),
            notDeleted(invoice.deletedAt)
          ),
        });
        const total = invoices.reduce((sum, i) => sum + i.amountDue, 0);
        const overdueCount = invoices.filter((i) => i.status === "overdue").length;
        return ok({ total, count: invoices.length, overdueCount });
      }

      case "accounts_payable": {
        const bills = await db.query.bill.findMany({
          where: and(
            eq(bill.organizationId, ctx.organizationId),
            notDeleted(bill.deletedAt)
          ),
        });
        const total = bills.reduce((sum, b) => sum + (b.amountDue ?? 0), 0);
        const overdueCount = bills.filter((b) => b.status === "overdue").length;
        return ok({ total, count: bills.length, overdueCount });
      }

      case "bank_balances": {
        const accounts = await db.query.bankAccount.findMany({
          where: and(
            eq(bankAccount.organizationId, ctx.organizationId),
            notDeleted(bankAccount.deletedAt)
          ),
        });
        return ok({
          accounts: accounts.map((a) => ({
            id: a.id,
            name: a.accountName,
            balance: a.balance,
            currencyCode: a.currencyCode,
          })),
        });
      }

      case "inventory_alerts": {
        const items = await db.query.inventoryItem.findMany({
          where: and(
            eq(inventoryItem.organizationId, ctx.organizationId),
            notDeleted(inventoryItem.deletedAt)
          ),
        });
        const lowStock = items.filter(
          (i) => i.isActive && i.quantityOnHand <= i.reorderPoint
        );
        return ok({
          lowStockCount: lowStock.length,
          items: lowStock.slice(0, 10).map((i) => ({
            id: i.id,
            name: i.name,
            code: i.code,
            quantityOnHand: i.quantityOnHand,
            reorderPoint: i.reorderPoint,
          })),
        });
      }

      case "quick_actions": {
        return ok({ actions: ["new_invoice", "new_bill", "new_entry", "new_contact"] });
      }

      default:
        return error(`Unknown widget type: ${type}`, 400);
    }
  } catch (err) {
    return handleError(err);
  }
}
