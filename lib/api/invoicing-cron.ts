import { db } from "@/lib/db";
import { recurringTemplate, reminderRule, quote, invoice, bill } from "@/lib/db/schema";
import { eq, and, lte, inArray, lt } from "drizzle-orm";
import { processRecurringTemplates } from "./recurring-generate";
import { processReminders } from "@/lib/email/reminder-processor";

export async function processInvoicingCron() {
  const today = new Date().toISOString().split("T")[0];

  // 1. Process recurring templates per org
  const dueTemplates = await db
    .selectDistinct({ orgId: recurringTemplate.organizationId })
    .from(recurringTemplate)
    .where(
      and(
        eq(recurringTemplate.status, "active"),
        lte(recurringTemplate.nextRunDate, today)
      )
    );

  let recurringGenerated = 0;
  for (const { orgId } of dueTemplates) {
    recurringGenerated += await processRecurringTemplates(orgId);
  }

  // 2. Process reminders per org
  const enabledRules = await db
    .selectDistinct({ orgId: reminderRule.organizationId })
    .from(reminderRule)
    .where(eq(reminderRule.enabled, true));

  let remindersSent = 0;
  let remindersFailed = 0;
  for (const { orgId } of enabledRules) {
    const result = await processReminders(orgId);
    remindersSent += result.sent;
    remindersFailed += result.failed;
  }

  // 3. Expire quotes: sent + expiryDate < today
  const expiredQuotes = await db
    .update(quote)
    .set({ status: "expired", updatedAt: new Date() })
    .where(
      and(
        eq(quote.status, "sent"),
        lt(quote.expiryDate, today)
      )
    )
    .returning({ id: quote.id });

  // 4. Mark invoices overdue: sent/partial + dueDate < today
  const overdueInvoices = await db
    .update(invoice)
    .set({ status: "overdue", updatedAt: new Date() })
    .where(
      and(
        inArray(invoice.status, ["sent", "partial"]),
        lt(invoice.dueDate, today)
      )
    )
    .returning({ id: invoice.id });

  // 5. Mark bills overdue: received/partial + dueDate < today
  const overdueBills = await db
    .update(bill)
    .set({ status: "overdue", updatedAt: new Date() })
    .where(
      and(
        inArray(bill.status, ["received", "partial"]),
        lt(bill.dueDate, today)
      )
    )
    .returning({ id: bill.id });

  return {
    recurringGenerated,
    remindersSent,
    remindersFailed,
    quotesExpired: expiredQuotes.length,
    invoicesOverdue: overdueInvoices.length,
    billsOverdue: overdueBills.length,
  };
}
