"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Send, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { renderTemplate } from "@/lib/email/template-engine";
import { formatMoney } from "@/lib/money";

interface SendDocumentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentType: "invoice" | "quote" | "credit_note" | "purchase_order" | "debit_note";
  documentId: string;
  documentNumber: string;
  contactEmail?: string | null;
  contactName?: string | null;
  organizationName?: string;
  amountDue?: number;
  dueDate?: string | null;
  sendApiUrl: string;
  onSent: () => void;
}

const documentTypeLabels: Record<string, string> = {
  invoice: "Invoice",
  quote: "Quote",
  credit_note: "Credit Note",
  purchase_order: "Purchase Order",
  debit_note: "Debit Note",
};

const defaultBodyTemplate = `Hi {{contactName}},

Please find attached {{documentType}} {{documentNumber}} for {{amountDue}}.

{{dueDateLine}}

If you have any questions, please don't hesitate to reach out.

Thanks,
{{organizationName}}`;

export function SendDocumentDialog({
  open,
  onOpenChange,
  documentType,
  documentId,
  documentNumber,
  contactEmail,
  contactName,
  organizationName = "",
  amountDue,
  dueDate,
  sendApiUrl,
  onSent,
}: SendDocumentDialogProps) {
  const [recipientEmail, setRecipientEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [attachPdf, setAttachPdf] = useState(true);
  const [sending, setSending] = useState(false);
  const [markingAsSent, setMarkingAsSent] = useState(false);

  const typeLabel = documentTypeLabels[documentType] || "Document";
  const showAttachPdf = documentType === "invoice";

  useEffect(() => {
    if (open) {
      setRecipientEmail(contactEmail || "");
      setSubject(`${typeLabel} ${documentNumber} from ${organizationName}`);

      const vars: Record<string, string> = {
        contactName: contactName || "there",
        documentNumber,
        organizationName,
        documentType: typeLabel.toLowerCase(),
        amountDue: amountDue != null ? formatMoney(amountDue) : "",
        dueDateLine: dueDate ? `Payment is due by ${dueDate}.` : "",
      };
      setBody(renderTemplate(defaultBodyTemplate, vars));
      setAttachPdf(documentType === "invoice");
    }
  }, [open, contactEmail, contactName, documentNumber, organizationName, amountDue, dueDate, documentType, typeLabel]);

  const orgId = typeof window !== "undefined" ? localStorage.getItem("activeOrgId") : null;

  async function handleSendEmail() {
    if (!orgId || !recipientEmail || !subject || !body) {
      toast.error("Please fill in all fields");
      return;
    }

    setSending(true);
    try {
      const res = await fetch(sendApiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-organization-id": orgId,
        },
        body: JSON.stringify({
          sendEmail: true,
          recipientEmail,
          subject,
          body,
          attachPdf,
        }),
      });

      if (res.ok) {
        toast.success(`${typeLabel} sent via email`);
        onOpenChange(false);
        onSent();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(typeof data.error === "string" ? data.error : `Failed to send ${typeLabel.toLowerCase()}`);
      }
    } finally {
      setSending(false);
    }
  }

  async function handleMarkAsSent() {
    if (!orgId) return;
    setMarkingAsSent(true);
    try {
      const res = await fetch(sendApiUrl, {
        method: "POST",
        headers: { "x-organization-id": orgId },
      });

      if (res.ok) {
        toast.success(`${typeLabel} marked as sent`);
        onOpenChange(false);
        onSent();
      } else {
        toast.error(`Failed to mark ${typeLabel.toLowerCase()} as sent`);
      }
    } finally {
      setMarkingAsSent(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Send {typeLabel}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>To</Label>
            <Input
              type="email"
              value={recipientEmail}
              onChange={(e) => setRecipientEmail(e.target.value)}
              placeholder="recipient@example.com"
            />
          </div>
          <div className="space-y-2">
            <Label>Subject</Label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Email subject"
            />
          </div>
          <div className="space-y-2">
            <Label>Message</Label>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={8}
              className="text-sm"
            />
          </div>
          {showAttachPdf && (
            <div className="flex items-center gap-2">
              <Checkbox
                id="attach-pdf"
                checked={attachPdf}
                onCheckedChange={(checked) => setAttachPdf(checked === true)}
              />
              <label htmlFor="attach-pdf" className="flex items-center gap-1.5 text-sm cursor-pointer">
                <Paperclip className="size-3.5 text-muted-foreground" />
                Attach PDF
              </label>
            </div>
          )}
          <div className="flex items-center gap-2 pt-2">
            <Button
              onClick={handleSendEmail}
              loading={sending}
              disabled={markingAsSent || !recipientEmail}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700"
            >
              <Send className="mr-2 size-4" />
              Send Email
            </Button>
            <Button
              variant="outline"
              onClick={handleMarkAsSent}
              loading={markingAsSent}
              disabled={sending}
            >
              Mark as Sent
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
