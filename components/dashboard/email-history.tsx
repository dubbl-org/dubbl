"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Mail, RotateCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface EmailLogEntry {
  id: string;
  recipientEmail: string;
  subject: string;
  status: string;
  sentAt: string;
}

interface EmailHistoryProps {
  documentType: string;
  documentId: string;
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export function EmailHistory({ documentType, documentId }: EmailHistoryProps) {
  const [emails, setEmails] = useState<EmailLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [resendingId, setResendingId] = useState<string | null>(null);

  const orgId = typeof window !== "undefined" ? localStorage.getItem("activeOrgId") : null;

  const loadEmails = useCallback(() => {
    if (!orgId) return;
    fetch(`/api/v1/document-emails?documentType=${documentType}&documentId=${documentId}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.emails) setEmails(data.emails);
      })
      .finally(() => setLoading(false));
  }, [orgId, documentType, documentId]);

  useEffect(() => {
    loadEmails();
  }, [loadEmails]);

  async function handleResend(emailId: string) {
    if (!orgId) return;
    setResendingId(emailId);
    try {
      const res = await fetch(`/api/v1/document-emails/${emailId}/resend`, {
        method: "POST",
        headers: { "x-organization-id": orgId },
      });
      if (res.ok) {
        toast.success("Email resent");
        loadEmails();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(typeof data.error === "string" ? data.error : "Failed to resend");
      }
    } finally {
      setResendingId(null);
    }
  }

  if (loading || emails.length === 0) return null;

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="flex items-center gap-2 border-b bg-muted/30 px-5 py-3">
        <Mail className="size-3.5 text-muted-foreground" />
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Email History
        </p>
      </div>
      <div className="divide-y">
        {emails.map((email) => (
          <div key={email.id} className="flex items-center justify-between px-5 py-3 gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm truncate">{email.recipientEmail}</span>
                <Badge
                  variant="outline"
                  className={
                    email.status === "sent"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                      : "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300"
                  }
                >
                  {email.status}
                </Badge>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <p className="text-xs text-muted-foreground truncate">{email.subject}</p>
                <span className="text-xs text-muted-foreground shrink-0">{timeAgo(email.sentAt)}</span>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0 h-7 text-xs gap-1"
              onClick={() => handleResend(email.id)}
              disabled={resendingId === email.id}
            >
              <RotateCw className={`size-3 ${resendingId === email.id ? "animate-spin" : ""}`} />
              Resend
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
