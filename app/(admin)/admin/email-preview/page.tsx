"use client";

import { useState, useEffect, useCallback } from "react";
import { ContentReveal } from "@/components/ui/content-reveal";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Eye, Monitor } from "lucide-react";
import { toast } from "sonner";

interface EmailTemplate {
  id: string;
  name: string;
}

export default function AdminEmailPreviewPage() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [emailHtml, setEmailHtml] = useState<string>("");
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/admin/email-preview");
      const data = await res.json();
      setTemplates(data.templates || []);
    } catch {
      toast.error("Failed to load email templates");
    } finally {
      setLoadingTemplates(false);
    }
  }, []);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const loadPreview = async (templateId: string) => {
    setSelectedTemplate(templateId);
    setLoadingPreview(true);
    try {
      const res = await fetch(
        `/api/v1/admin/email-preview?template=${templateId}`
      );
      const data = await res.json();
      setEmailHtml(data.html || "");
    } catch {
      toast.error("Failed to load preview");
    } finally {
      setLoadingPreview(false);
    }
  };

  return (
    <ContentReveal>
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold">Email Preview</h2>
          <p className="text-sm text-muted-foreground">
            Preview email templates with sample data
          </p>
        </div>

        {loadingTemplates ? (
          <Skeleton className="h-10 w-full rounded-lg" />
        ) : (
          <div className="flex items-center gap-2">
            <Select value={selectedTemplate} onValueChange={loadPreview}>
              <SelectTrigger className="w-64">
                <SelectValue placeholder="Select a template" />
              </SelectTrigger>
              <SelectContent>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedTemplate && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 shrink-0"
                onClick={() => {
                  const win = window.open("", "_blank");
                  if (win) {
                    win.document.write(emailHtml);
                    win.document.close();
                  }
                }}
                disabled={!emailHtml}
              >
                <Monitor className="size-3.5" />
                Full View
              </Button>
            )}
          </div>
        )}

        {!selectedTemplate && !loadingTemplates && (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-20">
            <Eye className="size-8 text-muted-foreground/30 mb-2" />
            <p className="text-xs text-muted-foreground">
              Select a template to preview
            </p>
          </div>
        )}

        {loadingPreview && (
          <Skeleton className="h-[600px] w-full rounded-lg" />
        )}

        {emailHtml && !loadingPreview && (
          <div className="rounded-lg border overflow-hidden bg-white">
            <iframe
              srcDoc={emailHtml}
              className="w-full h-[600px] border-0"
              title="Email preview"
              sandbox="allow-same-origin"
            />
          </div>
        )}
      </div>
    </ContentReveal>
  );
}
