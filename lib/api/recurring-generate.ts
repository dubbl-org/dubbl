import { db } from "@/lib/db";
import { recurringTemplate, invoice, invoiceLine, bill, billLine, expenseClaim, expenseItem, contact } from "@/lib/db/schema";
import { eq, and, lte } from "drizzle-orm";
import { notDeleted } from "@/lib/db/soft-delete";
import { getNextNumber } from "@/lib/api/numbering";
import { preloadTaxRates, calcTax } from "@/lib/api/tax-calculator";

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

        // Use contact payment terms for due date
        const contactRecord = await db.query.contact.findFirst({
          where: eq(contact.id, tmpl.contactId),
          columns: { paymentTermsDays: true },
        });
        const termsDays = contactRecord?.paymentTermsDays ?? 30;
        const dueDateBill = new Date(nextRun + "T00:00:00Z");
        dueDateBill.setUTCDate(dueDateBill.getUTCDate() + termsDays);
        const dueDateBillStr = dueDateBill.toISOString().split("T")[0];

        const billTaxRateIds = tmpl.lines.map((l) => l.taxRateId).filter(Boolean) as string[];
        const billRatesMap = await preloadTaxRates(billTaxRateIds);

        let billSubtotal = 0;
        const billLines = tmpl.lines.map((l, i) => {
          const grossAmt = Math.round((l.quantity / 100) * l.unitPrice);
          const discountAmt = l.discountPercent ? Math.round(grossAmt * l.discountPercent / 10000) : 0;
          const amt = grossAmt - discountAmt;
          billSubtotal += amt;
          const taxAmount = l.taxRateId ? calcTax(amt, billRatesMap.get(l.taxRateId) ?? 0) : 0;
          return {
            description: l.description,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            accountId: l.accountId,
            taxRateId: l.taxRateId,
            discountPercent: l.discountPercent,
            taxAmount,
            amount: amt,
            sortOrder: l.sortOrder ?? i,
          };
        });

        const billTaxTotal = billLines.reduce((sum, l) => sum + l.taxAmount, 0);
        const billTotal = billSubtotal + billTaxTotal;

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
            taxTotal: billTaxTotal,
            total: billTotal,
            amountPaid: 0,
            amountDue: billTotal,
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

      // Use contact payment terms for due date
      const invContact = await db.query.contact.findFirst({
        where: eq(contact.id, tmpl.contactId),
        columns: { paymentTermsDays: true },
      });
      const invTermsDays = invContact?.paymentTermsDays ?? 30;
      const dueDate = new Date(nextRun + "T00:00:00Z");
      dueDate.setUTCDate(dueDate.getUTCDate() + invTermsDays);
      const dueDateStr = dueDate.toISOString().split("T")[0];

      // Preload tax rates
      const invTaxRateIds = tmpl.lines.map((l) => l.taxRateId).filter(Boolean) as string[];
      const invRatesMap = await preloadTaxRates(invTaxRateIds);

      // Calculate totals from template lines
      let subtotal = 0;
      const processedLines = tmpl.lines.map((l, i) => {
        const grossAmount = Math.round((l.quantity / 100) * l.unitPrice);
        const discountAmount = l.discountPercent ? Math.round(grossAmount * l.discountPercent / 10000) : 0;
        const amount = grossAmount - discountAmount;
        subtotal += amount;
        const taxAmount = l.taxRateId ? calcTax(amount, invRatesMap.get(l.taxRateId) ?? 0) : 0;
        return {
          description: l.description,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          accountId: l.accountId,
          taxRateId: l.taxRateId,
          discountPercent: l.discountPercent,
          taxAmount,
          amount,
          sortOrder: l.sortOrder ?? i,
        };
      });

      const taxTotal = processedLines.reduce((sum, l) => sum + l.taxAmount, 0);
      const total = subtotal + taxTotal;

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
          taxTotal,
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
