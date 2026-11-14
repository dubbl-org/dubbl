"use client";

import { useCallback, useState } from "react";
import { Download, FileText, ImageIcon, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function ReceiptViewer({ fileKey, fileName }: { fileKey: string; fileName: string }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadUrl = useCallback(async () => {
    if (url) return;
    setLoading(true);
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;
    try {
      const res = await fetch(`/api/v1/expenses/receipt-url?fileKey=${encodeURIComponent(fileKey)}`, {
        headers: { "x-organization-id": orgId },
      });
      const data = await res.json();
      if (data.downloadUrl) setUrl(data.downloadUrl);
    } finally {
      setLoading(false);
    }
  }, [fileKey, url]);

  const isImage = /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(fileName);

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (v) loadUrl(); }}>
      <DialogTrigger asChild>
        <button className="inline-flex items-center gap-1.5 text-emerald-600 hover:text-emerald-700 transition-colors group">
          {isImage ? <ImageIcon className="size-3.5" /> : <FileText className="size-3.5" />}
          <span className="max-w-[100px] truncate text-xs group-hover:underline">{fileName}</span>
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="size-4" />
            {fileName}
          </DialogTitle>
        </DialogHeader>
        <div className="mt-2">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : url ? (
            <div className="space-y-3">
              {isImage ? (
                <div className="rounded-lg border overflow-hidden bg-muted/30">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt={fileName} className="w-full h-auto max-h-[60vh] object-contain" />
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 rounded-lg border bg-muted/30">
                  <FileText className="size-12 text-muted-foreground/40" />
                  <p className="mt-3 text-sm text-muted-foreground">Preview not available for this file type</p>
                </div>
              )}
              <div className="flex justify-end">
                <Button variant="outline" size="sm" asChild>
                  <a href={url} target="_blank" rel="noopener noreferrer" download={fileName}>
                    <Download className="mr-2 size-3.5" />
                    Download
                  </a>
                </Button>
              </div>
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">Failed to load receipt</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
