"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import {
  Paperclip,
  Lock,
  Trash2,
  Upload,
  Download,
  Loader2,
} from "lucide-react";
import { Section } from "@/components/dashboard/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ContentReveal } from "@/components/ui/content-reveal";
import { useContactContext, getOrgId } from "../layout";
import type { ContactFile } from "../layout";

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ContactFilesPage() {
  const { id } = useParams<{ id: string }>();
  const { confirm } = useContactContext();

  const [files, setFiles] = useState<ContactFile[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [fileVisibility, setFileVisibility] = useState<"organization" | "private">("organization");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchFiles = useCallback(async () => {
    const orgId = getOrgId();
    if (!orgId) return;
    setFilesLoading(true);
    try {
      const res = await fetch(`/api/v1/contacts/${id}/files`, {
        headers: { "x-organization-id": orgId },
      });
      const data = await res.json();
      setFiles(data.data ?? []);
    } catch {
      toast.error("Failed to load files");
    } finally {
      setFilesLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  async function handleFileUpload(file: File) {
    const orgId = getOrgId();
    if (!orgId) return;
    setUploading(true);
    try {
      const res = await fetch(`/api/v1/contacts/${id}/files`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-organization-id": orgId,
        },
        body: JSON.stringify({
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type || "application/octet-stream",
          visibility: fileVisibility,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Upload failed");
      }
      const data = await res.json();
      await fetch(data.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      toast.success("File uploaded");
      fetchFiles();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to upload file");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleDeleteFile(docId: string) {
    const orgId = getOrgId();
    if (!orgId) return;
    const ok = await confirm({ title: "Delete file", description: "Are you sure you want to delete this file?" });
    if (!ok) return;
    try {
      const res = await fetch(`/api/v1/documents/${docId}`, {
        method: "DELETE",
        headers: { "x-organization-id": orgId },
      });
      if (!res.ok) throw new Error();
      toast.success("File deleted");
      fetchFiles();
    } catch {
      toast.error("Failed to delete file");
    }
  }

  async function handleDownloadFile(docId: string) {
    const orgId = getOrgId();
    if (!orgId) return;
    try {
      const res = await fetch(`/api/v1/documents/${docId}/download`, {
        headers: { "x-organization-id": orgId },
      });
      const data = await res.json();
      if (data.downloadUrl) {
        window.open(data.downloadUrl, "_blank");
      }
    } catch {
      toast.error("Failed to download file");
    }
  }

  return (
    <ContentReveal key="files">
      <div className="space-y-6">
        <Section title="Files" description="Documents and files attached to this contact.">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Select value={fileVisibility} onValueChange={(v: "organization" | "private") => setFileVisibility(v)}>
                  <SelectTrigger className="h-8 w-[130px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="organization">Shared</SelectItem>
                    <SelectItem value="private">Private</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? (
                    <Loader2 className="mr-2 size-3.5 animate-spin" />
                  ) : (
                    <Upload className="mr-2 size-3.5" />
                  )}
                  {uploading ? "Uploading..." : "Upload file"}
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileUpload(file);
                  }}
                />
              </div>
              {files.length > 0 && (
                <p className="text-[12px] text-muted-foreground">
                  {files.length} {files.length === 1 ? "file" : "files"}
                </p>
              )}
            </div>

            {filesLoading && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            )}

            {!filesLoading && files.length === 0 && (
              <ContentReveal key="files-empty">
                <div className="flex flex-col items-center justify-center py-8 text-center rounded-lg border border-dashed">
                  <Paperclip className="mb-2 size-8 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground">
                    No files yet
                  </p>
                  <p className="text-xs text-muted-foreground/70 mt-1">
                    Upload files to attach them to this contact
                  </p>
                </div>
              </ContentReveal>
            )}

            {!filesLoading && files.length > 0 && (
              <ContentReveal key="files-list">
                <div className="rounded-lg border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40">
                        <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Name</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Size</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Visibility</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Uploaded</th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground" />
                      </tr>
                    </thead>
                    <tbody>
                      {files.map((file) => (
                        <tr key={file.id} className="border-b last:border-0">
                          <td className="px-3 py-2">
                            <button
                              onClick={() => handleDownloadFile(file.id)}
                              className="text-sm font-medium text-foreground hover:underline text-left"
                            >
                              {file.fileName}
                            </button>
                          </td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">
                            {formatFileSize(file.fileSize)}
                          </td>
                          <td className="px-3 py-2">
                            {file.visibility === "private" ? (
                              <Badge variant="outline" className="text-[11px] gap-1">
                                <Lock className="size-3" />
                                Private
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="text-[11px]">
                                Shared
                              </Badge>
                            )}
                          </td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">
                            {new Date(file.createdAt).toLocaleDateString()}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0"
                                onClick={() => handleDownloadFile(file.id)}
                              >
                                <Download className="size-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                                onClick={() => handleDeleteFile(file.id)}
                              >
                                <Trash2 className="size-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </ContentReveal>
            )}
          </div>
        </Section>
      </div>
    </ContentReveal>
  );
}
