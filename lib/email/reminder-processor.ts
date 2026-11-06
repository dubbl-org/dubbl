import { db } from "@/lib/db";
import {
  reminderRule,
  reminderLog,
  emailConfig,
  invoice,
  bill,
  organization,
} from "@/lib/db/schema";
import { eq, and, isNull, notInArray, sql } from "drizzle-orm";
import { sendEmail } from "./smtp-client";
import { sendPlatformEmail } from "./resend-client";
import { documentsFromAddress } from "./senders";
import { renderTemplate } from "./template-engine";
import { formatMoney } from "@/lib/money";
import { checkEmailLimit } from "@/lib/api/check-limit";
import { notifySafely, notifySystemAlert } from "@/lib/notifications/events";

/**
 * How reminder emails go out for an org: through its own mail server when it's
 * set up and verified, otherwise through dubbl's shared sender (like invoice
 * emails), with replies going to the organization's contact email.
 */
export async function reminderMailer(orgId: string, replyTo?: string | null) {
  const config = await db.query.emailConfig.findFirst({
    where: eq(emailConfig.organizationId, orgId),
  });
  const smtp = config?.isVerified ? config : null;
  return async (message: { to: string; subject: string; html: string }) => {
    if (smtp) {
      await sendEmail(smtp, message);
      return;
    }
    await checkEmailLimit(orgId);
    await sendPlatformEmail({
      ...message,
      from: documentsFromAddress(),
      replyTo: replyTo || undefined,
    });
  };
}

export async function processReminders(orgId: string) {
  // Get org for name
  const org = await db.query.organization.findFirst({
    where: eq(organization.id, orgId),
  });
  if (!org) return { sent: 0, failed: 0, skipped: 0 };

  const send = await reminderMailer(orgId, org.contactEmail);

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
      const body = renderTemplate(rule.bodyTemplate, vars);
      // Plain-text templates keep their line breaks in the HTML email.
      const html = /<[a-z][\s\S]*>/i.test(body) ? body : body.replace(/\r?\n/g, "<br>");

      if (recipients.length === 0) {
        // Nobody to send to: record the skip once so it shows in the Reminder
        // Log ("Skipped") with the reason, instead of silently doing nothing.
        const alreadyLogged = await db.query.reminderLog.findFirst({
          where: and(
            eq(reminderLog.reminderRuleId, rule.id),
            eq(reminderLog.documentId, doc.id),
            eq(reminderLog.status, "skipped")
          ),
        });
        if (!alreadyLogged) {
          await db.insert(reminderLog).values({
            organizationId: orgId,
            reminderRuleId: rule.id,
            documentType: rule.documentType,
            documentId: doc.id,
            recipientEmail: "",
            subject,
            status: "skipped",
            errorMessage:
              rule.recipientType === "contact_persons"
                ? "None of this contact's people has an email address"
                : rule.recipientType === "custom"
                  ? "The rule has no email addresses to send to"
                  : "This contact has no email address",
          });
        }
        skipped++;
        continue;
      }

      // Track whether any reminder actually went out for this document so we
      // bump the invoice's dunning (escalation) stage exactly once per run, not
      // once per recipient.
      let remindedThisDoc = false;
      for (const recipient of recipients) {
        try {
          await send({ to: recipient, subject, html });
          await db.insert(reminderLog).values({
            organizationId: orgId,
            reminderRuleId: rule.id,
            documentType: rule.documentType,
            documentId: doc.id,
            recipientEmail: recipient,
            subject,
            status: "sent",
          });
          remindedThisDoc = true;
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

      // After sending, advance the invoice's dunning stage by one. Only invoices
      // carry a dunningLevel; bills don't, so this is invoice-only. Org-scoped
      // so we never touch another org's row.
      if (remindedThisDoc && rule.documentType === "invoice") {
        await db
          .update(invoice)
          .set({ dunningLevel: sql`${invoice.dunningLevel} + 1` })
          .where(
            and(eq(invoice.id, doc.id), eq(invoice.organizationId, orgId))
          );
      }
    }
  }

  if (failed > 0) {
    await notifySafely(
      notifySystemAlert(orgId, {
        title: "Some payment reminders weren't sent",
        body: `${failed} reminder email${failed === 1 ? "" : "s"} failed. Open Settings > Reminders and check the Reminder Log for the reason.`,
      })
    );
  }

  return { sent, failed, skipped };
}
