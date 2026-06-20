"use client";

import { useState, useEffect, useCallback } from "react";
import { FileText, X, Eye, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { FileUploader } from "./file-uploader";

interface DocItem {
  id: string;
  fileName: string;
  mimeType: string;
}

/**
 * Attach receipts / invoices to any entity (e.g. a bank transaction or an
 * expense) via the shared document system. Uploads link the file to the entity
 * immediately, and the list shows what's already attached with view / remove.
 * Used across the categorize and expense capture flows so the behaviour is
 * identical everywhere.
 */
export function ReceiptAttachments({
  orgId,
  entityType,
  entityId,
  label = "Attach receipt or invoice (optional)",
}: {
  orgId: string | null;
  entityType: string;
  entityId: string | null;
  label?: string;
}) {
  const [docs, setDocs] = useState<DocItem[]>([]);
  const [loading, setLoading] = useState(false);
  // Bumped after each upload so the dropzone remounts clean (the file then shows
  // in the list above, not lingering in the dropzone).
  const [uploadKey, setUploadKey] = useState(0);

  const load = useCallback(async () => {
    if (!orgId || !entityId) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/v1/documents?entityType=${encodeURIComponent(entityType)}&entityId=${entityId}&limit=50`,
        { headers: { "x-organization-id": orgId } }
      );
      const data = await res.json();
      const list: DocItem[] = (data.data ?? []).map((d: DocItem) => ({
        id: d.id,
        fileName: d.fileName,
        mimeType: d.mimeType,
      }));
      setDocs(list);
    } catch {
      // leave list as-is on failure
    } finally {
      setLoading(false);
    }
  }, [orgId, entityType, entityId]);

  useEffect(() => {
    setDocs([]);
    load();
  }, [load]);

  async function view(id: string) {
    if (!orgId) return;
    try {
      const res = await fetch(`/api/v1/documents/${id}/download`, {
        headers: { "x-organization-id": orgId },
      });
      const data = await res.json();
      if (data.downloadUrl) window.open(data.downloadUrl, "_blank", "noopener");
      else throw new Error();
    } catch {
      toast.error("Couldn't open the file");
    }
  }

  async function remove(id: string) {
    if (!orgId) return;
    const prev = docs;
    setDocs((d) => d.filter((x) => x.id !== id));
    try {
      const res = await fetch(`/api/v1/documents/${id}`, {
        method: "DELETE",
        headers: { "x-organization-id": orgId },
      });
      if (!res.ok) throw new Error();
    } catch {
      setDocs(prev);
      toast.error("Couldn't remove the file");
    }
  }

  if (!entityId) return null;

  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>

      {docs.length > 0 && (
        <div className="space-y-1.5">
          {docs.map((d) => (
            <div
              key={d.id}
              className="flex items-center gap-2 rounded-md border bg-muted/20 px-2.5 py-1.5"
            >
              <FileText className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="flex-1 truncate text-xs">{d.fileName}</span>
              <button
                type="button"
                onClick={() => view(d.id)}
                className="rounded p-1 text-muted-foreground hover:bg-muted"
                title="View"
              >
                <Eye className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() => remove(d.id)}
                className="rounded p-1 text-muted-foreground hover:bg-muted"
                title="Remove"
              >
                <X className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {loading && docs.length === 0 ? (
        <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" /> Loading…
        </div>
      ) : (
        <FileUploader
          key={uploadKey}
          entityType={entityType}
          entityId={entityId}
          onUpload={() => {}}
          onAttached={() => { setUploadKey((k) => k + 1); load(); }}
          className="py-4"
        />
      )}
    </div>
  );
}
