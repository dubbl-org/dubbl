"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Send, Paperclip, Eye, Pencil, Mail, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
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
  issueDate?: string | null;
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

function formatDateDisplay(dateStr: string | null | undefined) {
  if (!dateStr) return undefined;
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

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
  issueDate,
  sendApiUrl,
  onSent,
}: SendDocumentDialogProps) {
  const [recipientEmail, setRecipientEmail] = useState("");
  const [personalMessage, setPersonalMessage] = useState("");
  const [attachPdf, setAttachPdf] = useState(true);
  const [sending, setSending] = useState(false);
  const [markingAsSent, setMarkingAsSent] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [previewHtml, setPreviewHtml] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);

  const typeLabel = documentTypeLabels[documentType] || "Document";
  const showAttachPdf = documentType === "invoice";
  const amountFormatted = amountDue != null ? formatMoney(amountDue) : undefined;
  const dueDateFormatted = formatDateDisplay(dueDate);
  const issueDateFormatted = formatDateDisplay(issueDate);

  useEffect(() => {
    if (open) {
      setRecipientEmail(contactEmail || "");
      setPersonalMessage("");
      setAttachPdf(documentType === "invoice");
      setPreviewing(false);
      setPreviewHtml("");
    }
  }, [open, contactEmail, documentType]);

  const orgId = typeof window !== "undefined" ? localStorage.getItem("activeOrgId") : null;

  const buildTemplateProps = useCallback(() => ({
    organizationName,
    contactName: contactName || "there",
    documentType,
    documentNumber,
    personalMessage: personalMessage || undefined,
    amountFormatted,
    dueDateFormatted,
    issueDateFormatted,
  }), [organizationName, contactName, documentType, documentNumber, personalMessage, amountFormatted, dueDateFormatted, issueDateFormatted]);

  async function handlePreview() {
    if (!orgId) return;
    setPreviewing(true);
    setPreviewLoading(true);
    try {
      const res = await fetch("/api/v1/document-emails/preview", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-organization-id": orgId,
        },
        body: JSON.stringify(buildTemplateProps()),
      });
      if (res.ok) {
        const data = await res.json();
        setPreviewHtml(data.html);
      } else {
        toast.error("Failed to load preview");
        setPreviewing(false);
      }
    } catch {
      toast.error("Failed to load preview");
      setPreviewing(false);
    } finally {
      setPreviewLoading(false);
    }
  }

  async function handleSendEmail() {
    if (!orgId || !recipientEmail) {
      toast.error("Recipient email is required");
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
          subject: `${typeLabel} ${documentNumber} from ${organizationName}`,
          templateProps: buildTemplateProps(),
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
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg w-full p-0 flex flex-col">
        <SheetHeader className="px-4 pt-4 pb-3 sm:px-6 sm:pt-6 sm:pb-4 border-b space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
              <Mail className="size-5" />
            </div>
            <div>
              <SheetTitle className="text-lg">Send {typeLabel}</SheetTitle>
              <SheetDescription>{documentNumber}</SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          {previewing ? (
            /* ---- Email Preview ---- */
            <div className="flex flex-col h-full">
              <div className="flex items-center justify-between px-4 py-2.5 sm:px-6 border-b bg-muted/30">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Email Preview</p>
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5" onClick={() => setPreviewing(false)}>
                  <Pencil className="size-3" />
                  Edit
                </Button>
              </div>
              {previewLoading ? (
                <div className="flex-1 flex items-center justify-center py-20">
                  <Loader2 className="size-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto bg-[#f4f7fa] dark:bg-muted/20">
                  <iframe
                    srcDoc={previewHtml}
                    className="w-full h-full min-h-[600px] border-0"
                    title="Email preview"
                    sandbox="allow-same-origin"
                  />
                </div>
              )}
            </div>
          ) : (
            /* ---- Compose Form ---- */
            <div className="space-y-5 px-4 py-4 sm:px-6 sm:py-5">
              {/* Recipient */}
              <div className="space-y-2">
                <Label className="text-xs">To</Label>
                <Input
                  type="email"
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  placeholder="recipient@example.com"
                />
              </div>

              {/* Document summary (read-only, shows what the email will contain) */}
              <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Email will include
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[11px] text-muted-foreground">{typeLabel}</p>
                    <p className="text-sm font-mono font-semibold">{documentNumber}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground">From</p>
                    <p className="text-sm font-medium">{organizationName || "-"}</p>
                  </div>
                  {amountFormatted && (
                    <div>
                      <p className="text-[11px] text-muted-foreground">
                        {documentType === "quote" ? "Total" : "Amount Due"}
                      </p>
                      <p className="text-sm font-mono font-semibold">{amountFormatted}</p>
                    </div>
                  )}
                  {dueDateFormatted && documentType !== "quote" && (
                    <div>
                      <p className="text-[11px] text-muted-foreground">Due Date</p>
                      <p className="text-sm font-medium">{dueDateFormatted}</p>
                    </div>
                  )}
                  {issueDateFormatted && (
                    <div>
                      <p className="text-[11px] text-muted-foreground">
                        {documentType === "quote" ? "Valid Until" : "Issue Date"}
                      </p>
                      <p className="text-sm font-medium">{issueDateFormatted}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-[11px] text-muted-foreground">Recipient</p>
                    <p className="text-sm font-medium">{contactName || "-"}</p>
                  </div>
                </div>
              </div>

              {/* Personal message */}
              <div className="space-y-2">
                <Label className="text-xs">Personal Message (optional)</Label>
                <Textarea
                  value={personalMessage}
                  onChange={(e) => setPersonalMessage(e.target.value)}
                  rows={4}
                  className="text-sm"
                  placeholder={`Add a note for ${contactName || "the recipient"}...`}
                />
                <p className="text-[11px] text-muted-foreground">
                  This message will appear above the document details in the email.
                </p>
              </div>

              {/* Options */}
              <div className="space-y-3">
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

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={handlePreview}
                >
                  <Eye className="size-3.5" />
                  Preview Email
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="sticky bottom-0 z-10 flex items-center gap-2 border-t bg-background/80 backdrop-blur-sm px-4 py-3 sm:px-6 sm:py-4">
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
      </SheetContent>
    </Sheet>
  );
}
