"use client";

import { useState, useEffect, useCallback } from "react";
import {
  FileText,
  Folder,
  FolderPlus,
  Upload,
  Download,
  Trash2,
  MoreHorizontal,
  ArrowLeft,
  File,
  Image,
  FileSpreadsheet,
  Search,
  FolderOpen,
  Lock,
  Users,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { ContentReveal } from "@/components/ui/content-reveal";
import { useConfirm } from "@/lib/hooks/use-confirm";

interface DocFolder {
  id: string;
  name: string;
  parentId: string | null;
}

interface Doc {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  folderId: string | null;
  createdAt: string;
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(mimeType: string) {
  if (mimeType.startsWith("image/")) return Image;
  if (mimeType.includes("spreadsheet") || mimeType.includes("csv")) return FileSpreadsheet;
  if (mimeType.includes("pdf")) return FileText;
  return File;
}

export default function DocumentsPage() {
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [folders, setFolders] = useState<DocFolder[]>([]);
  const [documents, setDocuments] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentFolder, setCurrentFolder] = useState<string | null>(null);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [creating, setCreating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  function getHeaders() {
    const orgId = localStorage.getItem("activeOrgId") || "";
    return { "x-organization-id": orgId, "Content-Type": "application/json" };
  }

  const fetchData = useCallback(async () => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;
    const headers = { "x-organization-id": orgId };

    const docParams = new URLSearchParams();
    if (currentFolder) docParams.set("folderId", currentFolder);
    docParams.set("limit", "100");

    try {
      const [foldersData, docsData] = await Promise.all([
        fetch("/api/v1/documents/folders", { headers }).then((r) => r.json()),
        fetch(`/api/v1/documents?${docParams}`, { headers }).then((r) => r.json()),
      ]);
      if (foldersData.folders) setFolders(foldersData.folders);
      if (docsData.data) setDocuments(docsData.data);
    } finally {
      setLoading(false);
    }
  }, [currentFolder]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handleCreateFolder() {
    if (!newFolderName.trim() || creating) return;
    setCreating(true);
    try {
      const res = await fetch("/api/v1/documents/folders", {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ name: newFolderName, parentId: currentFolder }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to create folder");
      }
      setNewFolderOpen(false);
      setNewFolderName("");
      await fetchData();
      toast.success("Folder created");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create folder");
    } finally {
      setCreating(false);
    }
  }

  async function handleDeleteDoc(doc: Doc) {
    await confirm({
      title: `Delete "${doc.fileName}"?`,
      description: "This file will be permanently deleted.",
      confirmLabel: "Delete",
      destructive: true,
      onConfirm: async () => {
        await fetch(`/api/v1/documents/${doc.id}`, {
          method: "DELETE",
          headers: getHeaders(),
        });
        await fetchData();
        toast.success("File deleted");
      },
    });
  }

  async function handleDeleteFolder(folder: DocFolder) {
    await confirm({
      title: `Delete folder "${folder.name}"?`,
      description: "This folder will be removed. Documents inside will become unorganized.",
      confirmLabel: "Delete",
      destructive: true,
      onConfirm: async () => {
        await fetch(`/api/v1/documents/folders/${folder.id}`, {
          method: "DELETE",
          headers: getHeaders(),
        });
        if (currentFolder === folder.id) setCurrentFolder(null);
        await fetchData();
        toast.success("Folder deleted");
      },
    });
  }

  async function handleDownload(doc: Doc) {
    const orgId = localStorage.getItem("activeOrgId") || "";
    const res = await fetch(`/api/v1/documents/${doc.id}/download`, {
      headers: { "x-organization-id": orgId },
    });
    const data = await res.json();
    if (data.downloadUrl) {
      window.open(data.downloadUrl, "_blank");
    }
  }

  async function handleUpload(files: FileList | File[]) {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;
    setUploading(true);
    try {
      for (const file of fileArray) {
        const res = await fetch("/api/v1/documents", {
          method: "POST",
          headers: getHeaders(),
          body: JSON.stringify({
            fileName: file.name,
            fileSize: file.size,
            mimeType: file.type || "application/octet-stream",
            folderId: currentFolder,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `Failed to upload ${file.name}`);
        }
        const { uploadUrl } = await res.json();
        await fetch(uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type || "application/octet-stream" },
          body: file,
        });
      }
      await fetchData();
      toast.success(fileArray.length === 1 ? "File uploaded" : `${fileArray.length} files uploaded`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function handleFileInput() {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.onchange = () => {
      if (input.files?.length) handleUpload(input.files);
    };
    input.click();
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length) handleUpload(e.dataTransfer.files);
  }

  const currentFolderObj = folders.find((f) => f.id === currentFolder);
  const childFolders = folders.filter((f) =>
    currentFolder ? f.parentId === currentFolder : !f.parentId
  );

  function getBreadcrumb(): { id: string | null; name: string }[] {
    const crumbs: { id: string | null; name: string }[] = [{ id: null, name: "Documents" }];
    if (!currentFolder) return crumbs;
    const path: DocFolder[] = [];
    let current = folders.find((f) => f.id === currentFolder);
    while (current) {
      path.unshift(current);
      current = current.parentId ? folders.find((f) => f.id === current!.parentId) : undefined;
    }
    for (const f of path) {
      crumbs.push({ id: f.id, name: f.name });
    }
    return crumbs;
  }

  if (loading) return <BrandLoader />;

  // Empty state when no folders and no documents at root level
  const isRootEmpty = !currentFolder && folders.length === 0 && documents.length === 0;

  const folderDialog = (
    <Dialog open={newFolderOpen} onOpenChange={setNewFolderOpen}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>New Folder</DialogTitle>
        </DialogHeader>
        <Input
          placeholder="Folder name"
          value={newFolderName}
          onChange={(e) => setNewFolderName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && newFolderName.trim() && handleCreateFolder()}
          disabled={creating}
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => setNewFolderOpen(false)} disabled={creating}>Cancel</Button>
          <Button onClick={handleCreateFolder} disabled={!newFolderName.trim() || creating}>
            {creating ? "Creating..." : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  if (isRootEmpty) {
    return (
      <ContentReveal>
        <div className="pt-12 pb-12 space-y-10">
          {/* Top: title + CTA */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Document Hub</h2>
              <p className="mt-1 text-sm text-muted-foreground max-w-md">
                Organize your business files in one place. Create folders, upload documents, and keep everything accessible to your team.
              </p>
            </div>
            <Button
              onClick={() => setNewFolderOpen(true)}
              className="bg-emerald-600 hover:bg-emerald-700 shrink-0"
            >
              <FolderPlus className="mr-2 size-4" />
              Create Folder
            </Button>
          </div>

          <div className="grid gap-6 sm:gap-8 grid-cols-1 lg:grid-cols-[1fr_1fr] items-start">
            {/* Left: mock file browser */}
            <div className="rounded-xl border bg-card overflow-hidden shadow-sm">
              <div className="bg-muted/30 px-5 py-3 border-b">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Example file browser
                </p>
              </div>
              <div className="divide-y">
                {/* Mock folders */}
                {[
                  { name: "Contracts", icon: Folder, color: "text-amber-500" },
                  { name: "Invoices", icon: Folder, color: "text-amber-500" },
                ].map(({ name, icon: Icon, color }) => (
                  <div key={name} className="flex items-center gap-3 px-5 py-3">
                    <Icon className={`size-5 ${color} shrink-0`} />
                    <span className="text-sm font-medium">{name}</span>
                    <Badge variant="outline" className="ml-auto text-[10px]">Folder</Badge>
                  </div>
                ))}
                {/* Mock files */}
                {[
                  { name: "Q1-Report.pdf", size: "2.4 MB", icon: FileText, color: "text-red-500" },
                  { name: "Team-Photo.jpg", size: "1.8 MB", icon: Image, color: "text-blue-500" },
                  { name: "Budget-2026.xlsx", size: "340 KB", icon: FileSpreadsheet, color: "text-emerald-600" },
                ].map(({ name, size, icon: Icon, color }) => (
                  <div key={name} className="flex items-center gap-3 px-5 py-3">
                    <Icon className={`size-5 ${color} shrink-0`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{name}</p>
                      <p className="text-[11px] text-muted-foreground">{size}</p>
                    </div>
                    <Download className="size-3.5 text-muted-foreground/40" />
                  </div>
                ))}
              </div>
              <div className="border-t bg-muted/20 px-5 py-2.5">
                <p className="text-[11px] text-muted-foreground font-mono tabular-nums">
                  2 folders · 3 files · 4.5 MB total
                </p>
              </div>
            </div>

            {/* Right: benefits */}
            <div className="space-y-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Why use Document Hub
              </p>
              {[
                {
                  title: "Nested folder structure",
                  desc: "Create folders and subfolders to organize documents by project, client, or department.",
                  icon: FolderOpen,
                  color: "border-l-amber-400",
                },
                {
                  title: "Quick file access",
                  desc: "Browse, download, and manage files from a single place. No more digging through emails.",
                  icon: Search,
                  color: "border-l-blue-400",
                },
                {
                  title: "Secure and scoped",
                  desc: "All files are encrypted and scoped to your organization. Only your team has access.",
                  icon: Lock,
                  color: "border-l-emerald-400",
                },
                {
                  title: "Team-wide visibility",
                  desc: "Every team member can access shared documents, keeping everyone on the same page.",
                  icon: Users,
                  color: "border-l-violet-400",
                },
              ].map(({ title, desc, icon: Icon, color }) => (
                <div key={title} className={`rounded-lg border border-l-[3px] ${color} bg-card px-4 py-3`}>
                  <div className="flex items-center gap-2">
                    <Icon className="size-3.5 text-muted-foreground" />
                    <p className="text-sm font-medium">{title}</p>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 ml-[22px]">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {folderDialog}
        {confirmDialog}
      </ContentReveal>
    );
  }

  const breadcrumb = getBreadcrumb();
  const totalSize = documents.reduce((s, d) => s + d.fileSize, 0);

  return (
    <ContentReveal>
      {/* Back link - same pattern as inventory/contacts */}
      {currentFolder && (
        <button
          onClick={() => setCurrentFolder(currentFolderObj?.parentId || null)}
          className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeft className="size-3.5" />
          {currentFolderObj?.parentId
            ? `Back to ${folders.find((f) => f.id === currentFolderObj.parentId)?.name || "parent"}`
            : "Back to documents"}
        </button>
      )}

      <div className="space-y-5">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            {/* Breadcrumb */}
            {breadcrumb.length > 1 && (
              <nav className="flex items-center gap-1 mb-1">
                {breadcrumb.map((crumb, i) => (
                  <div key={crumb.id ?? "root"} className="flex items-center gap-1">
                    {i > 0 && <ArrowRight className="size-3 text-muted-foreground/40" />}
                    {i < breadcrumb.length - 1 ? (
                      <button
                        onClick={() => setCurrentFolder(crumb.id)}
                        className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {crumb.name}
                      </button>
                    ) : (
                      <span className="text-[11px] font-medium text-foreground">{crumb.name}</span>
                    )}
                  </div>
                ))}
              </nav>
            )}
            <h2 className="text-lg font-semibold">
              {currentFolderObj ? currentFolderObj.name : "Documents"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {childFolders.length > 0 && `${childFolders.length} folder${childFolders.length !== 1 ? "s" : ""}`}
              {childFolders.length > 0 && documents.length > 0 && " · "}
              {documents.length > 0 && `${documents.length} file${documents.length !== 1 ? "s" : ""}`}
              {documents.length > 0 && ` · ${formatFileSize(totalSize)}`}
              {childFolders.length === 0 && documents.length === 0 && "Empty folder"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => setNewFolderOpen(true)}>
              <FolderPlus className="size-3" />
              New Folder
            </Button>
            <Button size="sm" className="h-7 text-xs gap-1" onClick={handleFileInput} disabled={uploading}>
              <Upload className="size-3" />
              {uploading ? "Uploading..." : "Upload"}
            </Button>
          </div>
        </div>

        {/* File browser card */}
        <div
          className={`rounded-xl border overflow-hidden transition-colors ${dragOver ? "border-primary ring-2 ring-primary/20" : "bg-card"}`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          {/* Column header */}
          {(childFolders.length > 0 || documents.length > 0) && (
            <div className="flex items-center gap-3 px-4 py-2 bg-muted/30 border-b">
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide flex-1">Name</span>
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide w-20 text-right hidden sm:block">Size</span>
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide w-24 text-right hidden sm:block">Date</span>
              <span className="w-16 shrink-0" />
            </div>
          )}

          {/* Folder rows */}
          {childFolders.map((folder) => (
            <div
              key={folder.id}
              className="flex items-center gap-3 px-4 py-2.5 border-b last:border-b-0 hover:bg-muted/50 transition-colors group"
            >
              <div
                className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer"
                role="button"
                tabIndex={0}
                onClick={() => setCurrentFolder(folder.id)}
                onKeyDown={(e) => e.key === "Enter" && setCurrentFolder(folder.id)}
              >
                <Folder className="size-5 text-amber-500 shrink-0" />
                <span className="text-sm font-medium truncate">{folder.name}</span>
              </div>
              <span className="text-[11px] text-muted-foreground w-20 text-right hidden sm:block">-</span>
              <span className="text-[11px] text-muted-foreground w-24 text-right hidden sm:block">-</span>
              <div className="w-16 shrink-0 flex justify-end">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="size-7 p-0 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <MoreHorizontal className="size-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => handleDeleteFolder(folder)}
                    >
                      <Trash2 className="size-4" /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          ))}

          {/* File rows */}
          {documents.map((doc) => {
            const FileIcon = getFileIcon(doc.mimeType);
            return (
              <div
                key={doc.id}
                className="flex items-center gap-3 px-4 py-2.5 border-b last:border-b-0 hover:bg-muted/50 transition-colors group"
              >
                <FileIcon className="size-5 text-muted-foreground shrink-0" />
                <span className="text-sm font-medium truncate min-w-0 flex-1">{doc.fileName}</span>
                <span className="text-[11px] text-muted-foreground tabular-nums w-20 text-right hidden sm:block">
                  {formatFileSize(doc.fileSize)}
                </span>
                <span className="text-[11px] text-muted-foreground w-24 text-right hidden sm:block">
                  {new Date(doc.createdAt).toLocaleDateString()}
                </span>
                <div className="w-16 shrink-0 flex justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button variant="ghost" size="sm" className="size-7 p-0" onClick={() => handleDownload(doc)}>
                    <Download className="size-3.5" />
                  </Button>
                  <Button variant="ghost" size="sm" className="size-7 p-0 text-destructive" onClick={() => handleDeleteDoc(doc)}>
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}

          {/* Empty / drop zone */}
          {documents.length === 0 && childFolders.length === 0 && (
            <div
              className="flex flex-col items-center justify-center py-16 text-center cursor-pointer"
              onClick={handleFileInput}
            >
              <div className="flex size-12 items-center justify-center rounded-2xl bg-muted">
                <Upload className="size-5 text-muted-foreground" />
              </div>
              <h3 className="mt-4 text-sm font-medium">
                {dragOver ? "Drop files here" : "Drop files or click to upload"}
              </h3>
              <p className="mt-1 text-xs text-muted-foreground max-w-xs">
                Drag and drop files into this folder, or click to browse your computer.
              </p>
            </div>
          )}
        </div>
      </div>

      {folderDialog}
      {confirmDialog}
    </ContentReveal>
  );
}
