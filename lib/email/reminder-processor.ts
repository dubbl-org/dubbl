import { db } from "@/lib/db";
import {
  reminderRule,
  reminderLog,
  emailConfig,
  invoice,
  bill,
  organization,
} from "@/lib/db/schema";
import { eq, and, isNull, notInArray } from "drizzle-orm";
import { sendEmail } from "./smtp-client";
import { renderTemplate } from "./template-engine";
import { formatMoney } from "@/lib/money";

export async function processReminders(orgId: string) {
  // Get SMTP config
  const config = await db.query.emailConfig.findFirst({
    where: eq(emailConfig.organizationId, orgId),
  });
  if (!config || !config.isVerified) return { sent: 0, failed: 0, skipped: 0 };

  // Get org for name
  const org = await db.query.organization.findFirst({
    where: eq(organization.id, orgId),
  });
  if (!org) return { sent: 0, failed: 0, skipped: 0 };

  // Get enabled rules
  const rules = await db.query.reminderRule.findMany({
    where: and(
      eq(reminderRule.organizationId, orgId),
      eq(reminderRule.enabled, true),
      isNull(reminderRule.deletedAt)
    ),
  });

  const today = new Date();
  let sent = 0,
    failed = 0,
    skipped = 0;

  for (const rule of rules) {
    // Get matching documents
    const documents =
      rule.documentType === "invoice"
        ? await db.query.invoice.findMany({
            where: and(
              eq(invoice.organizationId, orgId),
              notInArray(invoice.status, ["draft", "void", "paid"]),
              isNull(invoice.deletedAt)
            ),
            with: { contact: { with: { people: true } } },
          })
        : await db.query.bill.findMany({
            where: and(
              eq(bill.organizationId, orgId),
              notInArray(bill.status, ["draft", "void", "paid"]),
              isNull(bill.deletedAt)
            ),
            with: { contact: { with: { people: true } } },
          });

    for (const doc of documents) {
      const dueDate = new Date(doc.dueDate);
      const diffDays = Math.floor(
        (today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      // Check if trigger matches
      let matches = false;
      if (rule.triggerType === "before_due" && diffDays === -rule.triggerDays)
        matches = true;
      if (rule.triggerType === "on_due" && diffDays === 0) matches = true;
      if (rule.triggerType === "after_due" && diffDays === rule.triggerDays)
        matches = true;

      if (!matches) continue;

      // Check if already sent
      const existing = await db.query.reminderLog.findFirst({
        where: and(
          eq(reminderLog.reminderRuleId, rule.id),
          eq(reminderLog.documentId, doc.id),
          eq(reminderLog.status, "sent")
        ),
      });
      if (existing) {
        skipped++;
        continue;
      }

      // Resolve recipients
      const recipients: string[] = [];
      if (rule.recipientType === "contact_email" && doc.contact?.email) {
        recipients.push(doc.contact.email);
      } else if (
        rule.recipientType === "contact_persons" &&
        doc.contact?.people
      ) {
        for (const cp of doc.contact.people) {
          if (cp.email) recipients.push(cp.email);
        }
      } else if (rule.recipientType === "custom" && rule.customEmails) {
        recipients.push(...(rule.customEmails as string[]));
      }

      if (recipients.length === 0) {
        skipped++;
        continue;
      }

      // Render templates
      const docNumber =
        "invoiceNumber" in doc
          ? (doc as { invoiceNumber: string }).invoiceNumber
          : (doc as { billNumber: string }).billNumber;
      const vars = {
        contactName: doc.contact?.name || "",
        documentNumber: docNumber,
        amountDue: formatMoney(doc.amountDue, doc.currencyCode),
        dueDate: doc.dueDate,
        organizationName: org.name,
        daysOverdue: String(Math.max(0, diffDays)),
      };

      const subject = renderTemplate(rule.subjectTemplate, vars);
      const html = renderTemplate(rule.bodyTemplate, vars);

      for (const recipient of recipients) {
        try {
          await sendEmail(config, { to: recipient, subject, html });
          await db.insert(reminderLog).values({
            organizationId: orgId,
            reminderRuleId: rule.id,
            documentType: rule.documentType,
            documentId: doc.id,
            recipientEmail: recipient,
            subject,
            status: "sent",
          });
          sent++;
        } catch (err: unknown) {
          await db.insert(reminderLog).values({
            organizationId: orgId,
            reminderRuleId: rule.id,
            documentType: rule.documentType,
            documentId: doc.id,
            recipientEmail: recipient,
            subject,
            status: "failed",
            errorMessage: err instanceof Error ? err.message : "Unknown error",
          });
          failed++;
        }
      }
    }
  }

  return { sent, failed, skipped };
}
