import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { invoice, organization } from "@/lib/db/schema";
import { eq, and, notInArray, lt } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError, validationError } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import {
  calculateSimpleInterest,
  calculateCompoundInterest,
} from "@/lib/api/interest-calculator";

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);

    // Get org settings
    const org = await db.query.organization.findFirst({
      where: eq(organization.id, ctx.organizationId),
    });

    if (!org?.interestRate) {
      return validationError("No interest rate configured for this organization");
    }

    const interestRate = org.interestRate;
    const interestMethod = org.interestMethod || "simple";
    const graceDays = org.interestGraceDays || 0;

    const today = new Date().toISOString().slice(0, 10);

    // Get all overdue unpaid invoices
    const overdueInvoices = await db.query.invoice.findMany({
      where: and(
        eq(invoice.organizationId, ctx.organizationId),
        notDeleted(invoice.deletedAt),
        notInArray(invoice.status, ["draft", "void", "paid"]),
        lt(invoice.dueDate, today)
      ),
    });

    const results = [];

    for (const inv of overdueInvoices) {
      const dueDate = new Date(inv.dueDate);
      const now = new Date(today);
      const diffMs = now.getTime() - dueDate.getTime();
      const totalDaysOverdue = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      const daysOverdue = totalDaysOverdue - graceDays;

      if (daysOverdue <= 0) continue;

      const calculateInterest =
        interestMethod === "compound"
          ? calculateCompoundInterest
          : calculateSimpleInterest;

      const interestAmount = calculateInterest(
        inv.amountDue,
        interestRate,
        daysOverdue
      );

      if (interestAmount > 0) {
        results.push({
          invoiceId: inv.id,
          invoiceNumber: inv.invoiceNumber,
          amountDue: inv.amountDue,
          daysOverdue,
          interestAmount,
        });
      }
    }

    return NextResponse.json({ data: results });
  } catch (err) {
    return handleError(err);
  }
}
