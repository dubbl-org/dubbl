"use client";

import { useState, useEffect, useRef } from "react";
import { Database, Download, RotateCcw, Trash2, Upload, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ContentReveal } from "@/components/ui/content-reveal";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { toast } from "sonner";

interface Backup {
  id: string;
  type: "scheduled" | "manual" | "uploaded";
  status: "pending" | "completed" | "failed";
  sizeBytes: number | null;
  entityCounts: Record<string, number> | null;
  createdAt: string;
  expiresAt: string | null;
}

function formatSize(bytes: number | null): string {
  if (!bytes) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatEntitySummary(counts: Record<string, number> | null): string {
  if (!counts) return "-";
  const entries = Object.entries(counts)
    .filter(([, v]) => v > 0)
    .slice(0, 3);
  if (entries.length === 0) return "-";
  return entries.map(([k, v]) => `${v} ${k}`).join(", ");
}

function getOrgId(): string | null {
  return localStorage.getItem("activeOrgId");
}

export default function BackupsPage() {
  const [backups, setBackups] = useState<Backup[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [creating, setCreating] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const limit = 20;
  const totalPages = Math.ceil(total / limit);

  function fetchBackups(p = page) {
    const orgId = getOrgId();
    if (!orgId) return;

    fetch(`/api/v1/backups?page=${p}&limit=${limit}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        setBackups(data.data || []);
        setTotal(data.total || 0);
      })
      .catch(() => {
        toast.error("Failed to load backups");
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    fetchBackups();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  async function handleCreate() {
    const orgId = getOrgId();
    if (!orgId) return;
    setCreating(true);
    try {
      const res = await fetch("/api/v1/backups", {
        method: "POST",
        headers: { "x-organization-id": orgId },
      });
      if (!res.ok) throw new Error();
      toast.success("Backup created");
      fetchBackups();
    } catch {
      toast.error("Failed to create backup");
    } finally {
      setCreating(false);
    }
  }

  async function handleUpload(file: File) {
    const orgId = getOrgId();
    if (!orgId) return;
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await fetch("/api/v1/backups/upload", {
        method: "POST",
        headers: { "x-organization-id": orgId },
        body: form,
      });
      if (!res.ok) throw new Error();
      toast.success("Backup uploaded");
      fetchBackups();
    } catch {
      toast.error("Failed to upload backup");
    }
  }

  async function handleDownload(backup: Backup) {
    const orgId = getOrgId();
    if (!orgId) return;
    try {
      const res = await fetch(`/api/v1/backups/${backup.id}/download`, {
        headers: { "x-organization-id": orgId },
      });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `backup-${new Date(backup.createdAt).toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Failed to download backup");
    }
  }

  async function handleRestore(backup: Backup) {
    const dateLabel = new Date(backup.createdAt).toLocaleString();
    const confirmed = window.confirm(
      `This will replace all current data with the snapshot from ${dateLabel}. Current data will be moved to trash.`
    );
    if (!confirmed) return;

    const orgId = getOrgId();
    if (!orgId) return;
    setRestoringId(backup.id);
    try {
      const res = await fetch(`/api/v1/backups/${backup.id}/restore`, {
        method: "POST",
        headers: {
          "x-organization-id": orgId,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ confirm: true }),
      });
      if (!res.ok) throw new Error();
      toast.success("Backup restored successfully");
      fetchBackups();
    } catch {
      toast.error("Failed to restore backup");
    } finally {
      setRestoringId(null);
    }
  }

  async function handleDelete(backup: Backup) {
    const orgId = getOrgId();
    if (!orgId) return;
    setDeletingId(backup.id);
    try {
      const res = await fetch(`/api/v1/backups/${backup.id}`, {
        method: "DELETE",
        headers: { "x-organization-id": orgId },
      });
      if (!res.ok) throw new Error();
      toast.success("Backup deleted");
      fetchBackups();
    } catch {
      toast.error("Failed to delete backup");
    } finally {
      setDeletingId(null);
    }
  }

  if (loading && backups.length === 0) return <BrandLoader />;

  return (
    <ContentReveal className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold">Backups</h2>
          <p className="text-sm text-muted-foreground">
            Automated daily snapshots of your organization data
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleUpload(file);
              e.target.value = "";
            }}
          />
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="mr-1.5 size-3.5" />
            Upload Backup
          </Button>
          <Button
            size="sm"
            className="h-8 text-xs"
            disabled={creating}
            onClick={handleCreate}
          >
            {creating ? (
              <span className="mr-1.5 size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
            ) : (
              <Plus className="mr-1.5 size-3.5" />
            )}
            Create Backup
          </Button>
        </div>
      </div>

      {/* Table */}
      {backups.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-center">
          <div className="flex size-12 items-center justify-center rounded-xl bg-muted mb-3">
            <Database className="size-6 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium">No backups yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Create a backup or enable scheduled backups to get started.
          </p>
        </div>
      ) : (
        <>
          <div className="rounded-lg border">
            {/* Table header */}
            <div className="grid grid-cols-[1fr_1fr_80px_1.5fr_1fr_auto] gap-3 px-4 py-2.5 border-b bg-muted/40">
              <span className="text-xs font-medium text-muted-foreground">Type</span>
              <span className="text-xs font-medium text-muted-foreground">Date</span>
              <span className="text-xs font-medium text-muted-foreground">Size</span>
              <span className="text-xs font-medium text-muted-foreground">Entities</span>
              <span className="text-xs font-medium text-muted-foreground">Expires</span>
              <span className="text-xs font-medium text-muted-foreground">Actions</span>
            </div>

            {/* Table rows */}
            {backups.map((backup) => (
              <div
                key={backup.id}
                className="grid grid-cols-[1fr_1fr_80px_1.5fr_1fr_auto] gap-3 px-4 py-2.5 border-b last:border-b-0 items-center hover:bg-muted/30 transition-colors"
              >
                {/* Type */}
                <div>
                  <Badge
                    variant="outline"
                    className={
                      backup.type === "manual"
                        ? "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300"
                        : backup.type === "uploaded"
                          ? "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-300"
                          : ""
                    }
                  >
                    {backup.type}
                  </Badge>
                </div>

                {/* Date */}
                <span className="text-sm tabular-nums">
                  {new Date(backup.createdAt).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>

                {/* Size */}
                <span className="text-xs text-muted-foreground tabular-nums">
                  {formatSize(backup.sizeBytes)}
                </span>

                {/* Entities */}
                <span className="text-xs text-muted-foreground truncate">
                  {formatEntitySummary(backup.entityCounts)}
                </span>

                {/* Expires */}
                <span className="text-xs text-muted-foreground tabular-nums">
                  {backup.expiresAt
                    ? new Date(backup.expiresAt).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })
                    : "-"}
                </span>

                {/* Actions */}
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() => handleDownload(backup)}
                    title="Download"
                  >
                    <Download className="size-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    disabled={restoringId === backup.id}
                    onClick={() => handleRestore(backup)}
                    title="Restore"
                  >
                    <RotateCcw className={`size-3.5 ${restoringId === backup.id ? "animate-spin" : ""}`} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                    disabled={deletingId === backup.id}
                    onClick={() => handleDelete(backup)}
                    title="Delete"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <p className="text-[11px] text-muted-foreground tabular-nums">
                Page {page} of {totalPages}
              </p>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </ContentReveal>
  );
}
