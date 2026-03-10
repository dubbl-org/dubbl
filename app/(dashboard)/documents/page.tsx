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
import { cn } from "@/lib/utils";

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
