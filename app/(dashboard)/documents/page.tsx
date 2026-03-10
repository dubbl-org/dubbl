"use client";

import { useState, useEffect } from "react";
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
  Shield,
  Search,
  FolderOpen,
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

  function getHeaders() {
    const orgId = localStorage.getItem("activeOrgId") || "";
    return { "x-organization-id": orgId, "Content-Type": "application/json" };
  }

  function fetchData() {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;
    const headers = { "x-organization-id": orgId };

    const docParams = new URLSearchParams();
    if (currentFolder) docParams.set("folderId", currentFolder);
    docParams.set("limit", "100");

    Promise.all([
      fetch("/api/v1/documents/folders", { headers }).then((r) => r.json()),
      fetch(`/api/v1/documents?${docParams}`, { headers }).then((r) => r.json()),
    ])
      .then(([foldersData, docsData]) => {
        if (foldersData.folders) setFolders(foldersData.folders);
        if (docsData.data) setDocuments(docsData.data);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    fetchData();
  }, [currentFolder]);

  async function handleCreateFolder() {
    await fetch("/api/v1/documents/folders", {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ name: newFolderName, parentId: currentFolder }),
    });
    toast.success("Folder created");
    setNewFolderOpen(false);
    setNewFolderName("");
    fetchData();
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
        toast.success("File deleted");
        fetchData();
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
        toast.success("Folder deleted");
        if (currentFolder === folder.id) setCurrentFolder(null);
        fetchData();
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

  const currentFolderObj = folders.find((f) => f.id === currentFolder);
  const childFolders = folders.filter((f) =>
    currentFolder ? f.parentId === currentFolder : !f.parentId
  );

  if (loading) return <BrandLoader />;

  // Empty state when no folders and no documents at root level
  const isRootEmpty = !currentFolder && folders.length === 0 && documents.length === 0;

  if (isRootEmpty) {
    return (
      <ContentReveal>
        <div className="relative flex min-h-[calc(100vh-8rem)] flex-col">
          {/* Ghost file browser */}
          <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center pt-6">
            <div className="w-full max-w-2xl space-y-2">
              {/* Ghost folder row */}
              <div className="flex items-center gap-3 rounded-lg border border-muted/60 bg-card/40 p-3">
                <div className="size-5 rounded bg-amber-200/30 dark:bg-amber-800/20" />
                <div className="h-2.5 w-28 rounded bg-muted" />
                <div className="ml-auto h-2 w-12 rounded bg-muted/40" />
              </div>
              <div className="flex items-center gap-3 rounded-lg border border-muted/60 bg-card/40 p-3">
                <div className="size-5 rounded bg-amber-200/30 dark:bg-amber-800/20" />
                <div className="h-2.5 w-20 rounded bg-muted" />
                <div className="ml-auto h-2 w-12 rounded bg-muted/40" />
              </div>
              {/* Ghost file rows */}
              {[32, 24, 36, 20, 28].map((w, i) => (
                <div key={i} className="flex items-center gap-3 rounded-lg border border-muted/60 bg-card/40 p-3">
                  <div className="size-5 rounded bg-muted/40" />
                  <div className="flex-1 space-y-1.5">
                    <div className={`h-2.5 rounded bg-muted`} style={{ width: `${w * 4}px` }} />
                    <div className="h-2 w-20 rounded bg-muted/30" />
                  </div>
                </div>
              ))}
            </div>
            <div className="absolute inset-0 bg-gradient-to-b from-content-bg/20 via-content-bg/70 to-content-bg" />
          </div>

          {/* Centered content */}
          <div className="relative flex flex-1 flex-col items-center justify-center px-4 py-8 sm:py-12 text-center">
            <div className="flex size-12 sm:size-14 items-center justify-center rounded-2xl bg-emerald-100 dark:bg-emerald-950/50">
              <FolderOpen className="size-6 sm:size-7 text-emerald-600 dark:text-emerald-400" />
            </div>
            <h2 className="mt-4 sm:mt-5 text-lg sm:text-xl font-semibold tracking-tight">Document Hub</h2>
            <p className="mt-2 max-w-md text-xs sm:text-sm text-muted-foreground leading-relaxed">
              Organize your business files in one place. Create folders, upload documents, and keep everything accessible to your team.
            </p>
            <div className="mt-6 flex items-center gap-3">
              <Button
                size="lg"
                className="bg-emerald-600 hover:bg-emerald-700"
                onClick={() => setNewFolderOpen(true)}
              >
                <FolderPlus className="mr-2 size-4" />
                Create your first folder
              </Button>
            </div>
          </div>

          {/* Feature cards */}
          <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-3 px-4 sm:px-0 pb-6 sm:pb-8">
            {[
              {
                icon: Folder,
                title: "Organized folders",
                description: "Create nested folders to structure your documents by project, client, or category.",
                color: "text-amber-600 dark:text-amber-400",
                bg: "bg-amber-50 dark:bg-amber-950/40",
              },
              {
                icon: Search,
                title: "Quick access",
                description: "Find any file instantly. Every document is linked to the entity it belongs to.",
                color: "text-blue-600 dark:text-blue-400",
                bg: "bg-blue-50 dark:bg-blue-950/40",
              },
              {
                icon: Shield,
                title: "Secure storage",
                description: "Files are stored securely and scoped to your organization. Only your team can access them.",
                color: "text-emerald-600 dark:text-emerald-400",
                bg: "bg-emerald-50 dark:bg-emerald-950/40",
              },
            ].map(({ icon: Icon, title, description, color, bg }) => (
              <div key={title} className="rounded-xl p-4 sm:p-5">
                <div className={`flex size-9 items-center justify-center rounded-lg ${bg}`}>
                  <Icon className={`size-4.5 ${color}`} />
                </div>
                <h3 className="mt-3 text-[13px] font-semibold">{title}</h3>
                <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{description}</p>
              </div>
            ))}
          </div>
        </div>

        {/* New Folder Dialog */}
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
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => setNewFolderOpen(false)}>Cancel</Button>
              <Button onClick={handleCreateFolder} disabled={!newFolderName.trim()}>Create</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {confirmDialog}
      </ContentReveal>
    );
  }

  return (
    <ContentReveal>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {currentFolder && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => setCurrentFolder(currentFolderObj?.parentId || null)}
              >
                <ArrowLeft className="size-3" />
                Back
              </Button>
            )}
            <div>
              <h2 className="text-lg font-semibold">
                {currentFolderObj ? currentFolderObj.name : "Documents"}
              </h2>
              <p className="text-sm text-muted-foreground">
                {documents.length} file{documents.length !== 1 ? "s" : ""}
                {childFolders.length > 0 && ` · ${childFolders.length} folder${childFolders.length !== 1 ? "s" : ""}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => setNewFolderOpen(true)}>
              <FolderPlus className="size-3" />
              New Folder
            </Button>
          </div>
        </div>

        {/* Folders */}
        {childFolders.length > 0 && (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {childFolders.map((folder) => (
              <button
                key={folder.id}
                onClick={() => setCurrentFolder(folder.id)}
                className="flex items-center gap-3 rounded-lg border bg-card p-3 text-left transition-colors hover:bg-muted/50"
              >
                <Folder className="size-5 text-amber-500 shrink-0" />
                <span className="text-sm font-medium truncate">{folder.name}</span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-auto size-6 p-0 shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MoreHorizontal className="size-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={(e) => { e.stopPropagation(); handleDeleteFolder(folder); }}
                    >
                      <Trash2 className="size-4" /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </button>
            ))}
          </div>
        )}

        {/* Files */}
        {documents.length === 0 && childFolders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-muted">
              <FileText className="size-6 text-muted-foreground" />
            </div>
            <h3 className="mt-4 text-sm font-medium">No documents</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Upload files or create folders to organize your documents.
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {documents.map((doc) => {
              const FileIcon = getFileIcon(doc.mimeType);
              return (
                <div
                  key={doc.id}
                  className="flex items-center gap-3 rounded-lg border bg-card p-3"
                >
                  <FileIcon className="size-5 text-muted-foreground shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{doc.fileName}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {formatFileSize(doc.fileSize)} · {new Date(doc.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
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
          </div>
        )}

        {/* New Folder Dialog */}
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
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => setNewFolderOpen(false)}>Cancel</Button>
              <Button onClick={handleCreateFolder} disabled={!newFolderName.trim()}>Create</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {confirmDialog}
      </div>
    </ContentReveal>
  );
}
