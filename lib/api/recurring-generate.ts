import { db } from "@/lib/db";
import { recurringTemplate, invoice, invoiceLine, bill, billLine, expenseClaim, expenseItem } from "@/lib/db/schema";
import { eq, and, lte } from "drizzle-orm";
import { notDeleted } from "@/lib/db/soft-delete";
import { getNextNumber } from "@/lib/api/numbering";

/**
 * Advance a date by the given frequency.
 */
function advanceDate(date: string, frequency: string): string {
  const d = new Date(date + "T00:00:00Z");
  switch (frequency) {
    case "weekly":
      d.setUTCDate(d.getUTCDate() + 7);
      break;
    case "fortnightly":
      d.setUTCDate(d.getUTCDate() + 14);
      break;
    case "monthly":
      d.setUTCMonth(d.getUTCMonth() + 1);
      break;
    case "quarterly":
      d.setUTCMonth(d.getUTCMonth() + 3);
      break;
    case "semi_annual":
      d.setUTCMonth(d.getUTCMonth() + 6);
      break;
    case "annual":
      d.setUTCFullYear(d.getUTCFullYear() + 1);
      break;
  }
  return d.toISOString().split("T")[0];
}

/**
 * Process all due recurring templates for an organization.
 * Generates invoices for any template where nextRunDate <= today.
 * Returns the number of invoices generated.
 */
export async function processRecurringTemplates(organizationId: string): Promise<number> {
  const today = new Date().toISOString().split("T")[0];

  // Find all active templates that are due
  const dueTemplates = await db.query.recurringTemplate.findMany({
    where: and(
      eq(recurringTemplate.organizationId, organizationId),
      eq(recurringTemplate.status, "active"),
      lte(recurringTemplate.nextRunDate, today),
      notDeleted(recurringTemplate.deletedAt),
    ),
    with: { lines: true },
  });

  let generated = 0;

  for (const tmpl of dueTemplates) {
    // Generate all missed invoices (if nextRunDate is far in the past, catch up)
    let nextRun = tmpl.nextRunDate;
    let occurrences = tmpl.occurrencesGenerated;

    while (nextRun <= today) {
      // Check max occurrences
      if (tmpl.maxOccurrences !== null && occurrences >= tmpl.maxOccurrences) {
        break;
      }
      // Check end date
      if (tmpl.endDate && nextRun > tmpl.endDate) {
        break;
      }

      if (tmpl.type === "bill") {
        const billNumber = await getNextNumber(organizationId, "bill", "bill_number", "BILL");
        const dueDateBill = new Date(nextRun + "T00:00:00Z");
        dueDateBill.setUTCDate(dueDateBill.getUTCDate() + 30);
        const dueDateBillStr = dueDateBill.toISOString().split("T")[0];

        let billSubtotal = 0;
        const billLines = tmpl.lines.map((l, i) => {
          const amt = Math.round((l.quantity / 100) * l.unitPrice);
          billSubtotal += amt;
          return {
            description: l.description,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            accountId: l.accountId,
            taxRateId: l.taxRateId,
            taxAmount: 0,
            amount: amt,
            sortOrder: l.sortOrder ?? i,
          };
        });

        const [createdBill] = await db
          .insert(bill)
          .values({
            organizationId,
            contactId: tmpl.contactId,
            billNumber,
            issueDate: nextRun,
            dueDate: dueDateBillStr,
            reference: tmpl.reference,
            notes: tmpl.notes,
            subtotal: billSubtotal,
            taxTotal: 0,
            total: billSubtotal,
            amountPaid: 0,
            amountDue: billSubtotal,
            currencyCode: tmpl.currencyCode,
            createdBy: tmpl.createdBy,
          })
          .returning();

        if (billLines.length > 0) {
          await db.insert(billLine).values(
            billLines.map((l) => ({ billId: createdBill.id, ...l }))
          );
        }

        occurrences++;
        generated++;
        nextRun = advanceDate(nextRun, tmpl.frequency);
        continue;
      }

      if (tmpl.type === "expense") {
        let expenseTotal = 0;
        const expenseItems = tmpl.lines.map((l, i) => {
          const amt = Math.round((l.quantity / 100) * l.unitPrice);
          expenseTotal += amt;
          return {
            date: nextRun,
            description: l.description,
            amount: amt,
            accountId: l.accountId,
            sortOrder: l.sortOrder ?? i,
          };
        });

        const [createdClaim] = await db
          .insert(expenseClaim)
          .values({
            organizationId,
            title: tmpl.name,
            description: tmpl.notes,
            submittedBy: tmpl.createdBy!,
            totalAmount: expenseTotal,
            currencyCode: tmpl.currencyCode,
          })
          .returning();

        if (expenseItems.length > 0) {
          await db.insert(expenseItem).values(
            expenseItems.map((item) => ({
              expenseClaimId: createdClaim.id,
              ...item,
            }))
          );
        }

        occurrences++;
        generated++;
        nextRun = advanceDate(nextRun, tmpl.frequency);
        continue;
      }

      if (tmpl.type !== "invoice") {
        break;
      }

      const invoiceNumber = await getNextNumber(organizationId, "invoice", "invoice_number", "INV");

      // Calculate due date (30 days from issue)
      const dueDate = new Date(nextRun + "T00:00:00Z");
      dueDate.setUTCDate(dueDate.getUTCDate() + 30);
      const dueDateStr = dueDate.toISOString().split("T")[0];

      // Calculate totals from template lines
      let subtotal = 0;
      const processedLines = tmpl.lines.map((l, i) => {
        const amount = Math.round((l.quantity / 100) * l.unitPrice);
        subtotal += amount;
        return {
          description: l.description,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          accountId: l.accountId,
          taxRateId: l.taxRateId,
          taxAmount: 0,
          amount,
          sortOrder: l.sortOrder ?? i,
        };
      });

      const total = subtotal;

      const [created] = await db
        .insert(invoice)
        .values({
          organizationId,
          contactId: tmpl.contactId,
          invoiceNumber,
          issueDate: nextRun,
          dueDate: dueDateStr,
          reference: tmpl.reference,
          notes: tmpl.notes,
          subtotal,
          taxTotal: 0,
          total,
          amountPaid: 0,
          amountDue: total,
          currencyCode: tmpl.currencyCode,
          createdBy: tmpl.createdBy,
        })
        .returning();

      if (processedLines.length > 0) {
        await db.insert(invoiceLine).values(
          processedLines.map((l) => ({
            invoiceId: created.id,
            ...l,
          }))
        );
      }

      occurrences++;
      generated++;
      nextRun = advanceDate(nextRun, tmpl.frequency);
    }

    // Determine new status
    const reachedMax = tmpl.maxOccurrences !== null && occurrences >= tmpl.maxOccurrences;
    const pastEnd = tmpl.endDate && nextRun > tmpl.endDate;
    const newStatus = reachedMax || pastEnd ? "completed" : "active";

    // Update the template
    await db
      .update(recurringTemplate)
      .set({
        nextRunDate: nextRun,
        lastRunDate: today,
        occurrencesGenerated: occurrences,
        status: newStatus,
        updatedAt: new Date(),
      })
      .where(eq(recurringTemplate.id, tmpl.id));
  }

  return generated;
}
