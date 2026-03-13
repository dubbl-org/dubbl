"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  FileText,
  Folder,
  FolderPlus,
  Upload,
  Download,
  Trash2,
  MoreHorizontal,
  File,
  Image,
  FileSpreadsheet,
  Search,
  FolderOpen,
  Lock,
  Users,
  ArrowRight,
  ArrowUpDown,
  Pencil,
  Check as CheckIcon,
  X,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { PageHeader } from "@/components/dashboard/page-header";
import { ContentReveal } from "@/components/ui/content-reveal";
import { SearchInput } from "@/components/ui/search-input";
import { useConfirm } from "@/lib/hooks/use-confirm";
import { useDebounce } from "@/lib/hooks/use-debounce";
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
  visibility: "organization" | "private";
  uploadedBy: string;
  createdAt: string;
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(mimeType: string) {
  if (mimeType.startsWith("image/")) return { icon: Image, color: "text-blue-500" };
  if (mimeType.includes("spreadsheet") || mimeType.includes("csv")) return { icon: FileSpreadsheet, color: "text-emerald-600" };
  if (mimeType.includes("pdf")) return { icon: FileText, color: "text-red-500" };
  return { icon: File, color: "text-muted-foreground" };
}

const EASE = [0.22, 1, 0.36, 1] as const;
const ROW_VARIANTS = {
  hidden: { opacity: 0, x: -8 },
  visible: (i: number) => ({
    opacity: 1,
    x: 0,
    transition: { delay: i * 0.03, duration: 0.3, ease: EASE },
  }),
};

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
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [uploadVisibility, setUploadVisibility] = useState<"organization" | "private">("organization");
  const [uploadNames, setUploadNames] = useState<Record<number, string>>({});
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search);
  const isSearching = search !== debouncedSearch;
  const [typeFilter, setTypeFilter] = useState<"all" | "documents" | "images" | "spreadsheets">("all");
  const [sortBy, setSortBy] = useState<"name" | "date" | "size">("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [selectedDoc, setSelectedDoc] = useState<Doc | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [editName, setEditName] = useState("");
  const [savingName, setSavingName] = useState(false);

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

  function navigateToFolder(folderId: string | null) {
    setCurrentFolder(folderId);
    setSearch("");
    setTypeFilter("all");
  }

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

  async function handleUpload(files: File[], visibility: "organization" | "private" = "organization") {
    if (files.length === 0) return;
    setUploading(true);
    setUploadDialogOpen(false);
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const fileName = uploadNames[i]?.trim() || file.name;
        const res = await fetch("/api/v1/documents", {
          method: "POST",
          headers: getHeaders(),
          body: JSON.stringify({
            fileName,
            fileSize: file.size,
            mimeType: file.type || "application/octet-stream",
            folderId: currentFolder,
            visibility,
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
      toast.success(files.length === 1 ? "File uploaded" : `${files.length} files uploaded`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      setPendingFiles([]);
      setUploadNames({});
    }
  }

  function handleFileInput() {
    const input = window.document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.onchange = () => {
      if (input.files?.length) {
        setPendingFiles(Array.from(input.files));
        setUploadVisibility("organization");
        setUploadNames({});
        setUploadDialogOpen(true);
      }
    };
    input.click();
  }

  async function handleToggleVisibility(doc: Doc) {
    const newVisibility = doc.visibility === "organization" ? "private" : "organization";
    try {
      const res = await fetch(`/api/v1/documents/${doc.id}`, {
        method: "PATCH",
        headers: getHeaders(),
        body: JSON.stringify({ visibility: newVisibility }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to update visibility");
      }
      await fetchData();
      // Update selected doc if it's the same one
      if (selectedDoc?.id === doc.id) {
        setSelectedDoc({ ...doc, visibility: newVisibility });
      }
      toast.success(newVisibility === "private" ? "File set to private" : "File shared with team");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update");
    }
  }

  const isPreviewable = useCallback((mimeType: string) => {
    return mimeType.startsWith("image/") || mimeType === "application/pdf";
  }, []);

  const openFileSheet = useCallback(async (doc: Doc) => {
    setSelectedDoc(doc);
    setEditingName(false);
    setPreviewUrl(null);

    if (isPreviewable(doc.mimeType)) {
      setPreviewLoading(true);
      try {
        const orgId = localStorage.getItem("activeOrgId") || "";
        const res = await fetch(`/api/v1/documents/${doc.id}/download`, {
          headers: { "x-organization-id": orgId },
        });
        const data = await res.json();
        if (data.downloadUrl) setPreviewUrl(data.downloadUrl);
      } catch {
        // preview not available, that's ok
      } finally {
        setPreviewLoading(false);
      }
    }
  }, [isPreviewable]);

  async function handleRename(doc: Doc, newName: string) {
    if (!newName.trim() || newName === doc.fileName) {
      setEditingName(false);
      return;
    }
    setSavingName(true);
    try {
      const res = await fetch(`/api/v1/documents/${doc.id}`, {
        method: "PATCH",
        headers: getHeaders(),
        body: JSON.stringify({ fileName: newName.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to rename");
      }
      await fetchData();
      setSelectedDoc({ ...doc, fileName: newName.trim() });
      setEditingName(false);
      toast.success("File renamed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to rename");
    } finally {
      setSavingName(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length) {
      setPendingFiles(Array.from(e.dataTransfer.files));
      setUploadVisibility("organization");
      setUploadNames({});
      setUploadDialogOpen(true);
    }
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

  // Filter by type
  const typeFiltered = useMemo(() => {
    if (typeFilter === "all") return documents;
    return documents.filter((d) => {
      if (typeFilter === "images") return d.mimeType.startsWith("image/");
      if (typeFilter === "spreadsheets") return d.mimeType.includes("spreadsheet") || d.mimeType.includes("csv");
      if (typeFilter === "documents") return d.mimeType.includes("pdf") || d.mimeType.includes("document") || d.mimeType.includes("text");
      return true;
    });
  }, [documents, typeFilter]);

  // Filter by search
  const q = debouncedSearch.toLowerCase();
  const filteredFolders = q ? childFolders.filter((f) => f.name.toLowerCase().includes(q)) : childFolders;
  const searchedDocs = q ? typeFiltered.filter((d) => d.fileName.toLowerCase().includes(q)) : typeFiltered;

  // Sort
  const filteredDocs = useMemo(() => [...searchedDocs].sort((a, b) => {
    const dir = sortOrder === "asc" ? 1 : -1;
    switch (sortBy) {
      case "date": return dir * (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      case "size": return dir * (a.fileSize - b.fileSize);
      case "name":
      default: return dir * a.fileName.localeCompare(b.fileName);
    }
  }), [searchedDocs, sortBy, sortOrder]);

  // View key that changes on folder navigation, type filter, and search to trigger animations
  const viewKey = `${currentFolder ?? "root"}-${typeFilter}-${debouncedSearch}`;
  const hasResults = filteredFolders.length > 0 || filteredDocs.length > 0;

  if (loading) return <BrandLoader />;

  // Empty state when no folders and no documents at root level
  const isRootEmpty = !currentFolder && folders.length === 0 && documents.length === 0;

  const uploadDialog = (
    <Dialog open={uploadDialogOpen} onOpenChange={(open) => {
      setUploadDialogOpen(open);
      if (!open) { setPendingFiles([]); setUploadNames({}); }
    }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Upload {pendingFiles.length === 1 ? "File" : `${pendingFiles.length} Files`}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            {pendingFiles.map((file, i) => {
              const { icon: FIcon, color: fColor } = getFileIcon(file.type);
              const displayName = uploadNames[i] ?? file.name;
              const isDuplicate = documents.some((d) => d.fileName === displayName);
              return (
                <div key={i} className="space-y-1">
                  <div className="flex items-center gap-2.5 rounded-lg border px-3 py-2">
                    <FIcon className={cn("size-4 shrink-0", fColor)} />
                    <Input
                      value={displayName}
                      onChange={(e) => setUploadNames((prev) => ({ ...prev, [i]: e.target.value }))}
                      className="h-auto border-0 p-0 text-[13px] font-medium shadow-none focus-visible:ring-0"
                    />
                    <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">
                      {formatFileSize(file.size)}
                    </span>
                  </div>
                  {isDuplicate && (
                    <p className="text-[11px] text-amber-600 dark:text-amber-400 pl-1">
                      A file with this name already exists and will be kept as a separate copy.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Visibility</label>
            <Select value={uploadVisibility} onValueChange={(v) => setUploadVisibility(v as "organization" | "private")}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="organization">
                  <div className="flex items-center gap-2">
                    <Users className="size-3.5 text-muted-foreground" />
                    <span>Shared with team</span>
                  </div>
                </SelectItem>
                <SelectItem value="private">
                  <div className="flex items-center gap-2">
                    <Lock className="size-3.5 text-muted-foreground" />
                    <span>Private (only you)</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { setUploadDialogOpen(false); setPendingFiles([]); setUploadNames({}); }}>Cancel</Button>
          <Button
            onClick={() => handleUpload(pendingFiles, uploadVisibility)}
            disabled={pendingFiles.length === 0 || uploading}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {uploading ? "Uploading..." : "Upload"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

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

        {uploadDialog}
        {folderDialog}
        {confirmDialog}
      </ContentReveal>
    );
  }

  const breadcrumb = getBreadcrumb();
  const totalSize = documents.reduce((s, d) => s + d.fileSize, 0);
  const totalFiles = documents.length;
  const totalFolders = childFolders.length;

  return (
    <ContentReveal className="space-y-6">
      {/* Breadcrumb navigation */}
      {currentFolder && (
        <nav className="flex items-center gap-1.5 flex-wrap">
          {breadcrumb.map((crumb, i) => (
            <div key={crumb.id ?? "root"} className="flex items-center gap-1.5">
              {i > 0 && <ArrowRight className="size-3 text-muted-foreground/40" />}
              {i < breadcrumb.length - 1 ? (
                <button
                  onClick={() => navigateToFolder(crumb.id)}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {crumb.name}
                </button>
              ) : (
                <span className="text-xs font-medium text-foreground">{crumb.name}</span>
              )}
            </div>
          ))}
        </nav>
      )}

      <PageHeader
        title={currentFolderObj ? currentFolderObj.name : "Documents"}
        description={
          currentFolder
            ? `${totalFolders > 0 ? `${totalFolders} folder${totalFolders !== 1 ? "s" : ""}` : ""}${totalFolders > 0 && totalFiles > 0 ? " · " : ""}${totalFiles > 0 ? `${totalFiles} file${totalFiles !== 1 ? "s" : ""} · ${formatFileSize(totalSize)}` : ""}${totalFolders === 0 && totalFiles === 0 ? "Empty folder" : ""}`
            : `${folders.length} folder${folders.length !== 1 ? "s" : ""} · ${totalFiles} file${totalFiles !== 1 ? "s" : ""}${totalSize > 0 ? ` · ${formatFileSize(totalSize)}` : ""}`
        }
      >
        <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={() => setNewFolderOpen(true)}>
          <FolderPlus className="size-3" />
          New Folder
        </Button>
        <Button
          size="sm"
          className="h-8 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700"
          onClick={handleFileInput}
          disabled={uploading}
        >
          <Upload className="size-3" />
          {uploading ? "Uploading..." : "Upload Files"}
        </Button>
      </PageHeader>

      {/* Toolbar */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Tabs value={typeFilter} onValueChange={(v) => setTypeFilter(v as typeof typeFilter)}>
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="documents">Documents</TabsTrigger>
              <TabsTrigger value="images">Images</TabsTrigger>
              <TabsTrigger value="spreadsheets">Spreadsheets</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search files and folders..."
            loading={isSearching}
          />

          <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
            <SelectTrigger className="h-8 w-full sm:w-[140px] text-xs">
              <ArrowUpDown className="size-3 mr-1.5 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name">Name</SelectItem>
              <SelectItem value="date">Date</SelectItem>
              <SelectItem value="size">Size</SelectItem>
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="icon"
            className="size-8 shrink-0"
            onClick={() => setSortOrder((prev) => prev === "asc" ? "desc" : "asc")}
          >
            <ArrowUpDown className={cn("size-3.5 transition-transform", sortOrder === "asc" && "rotate-180")} />
          </Button>
        </div>
      </div>

      {/* File browser with transitions */}
      <AnimatePresence mode="wait" initial={false}>
        {!hasResults && (q || typeFilter !== "all") ? (
          <motion.div
            key={`empty-${viewKey}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="flex flex-col items-center justify-center py-16 text-center"
          >
            <div className="mx-auto flex size-10 items-center justify-center rounded-xl bg-muted mb-3">
              <Search className="size-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">No results</p>
            <p className="text-xs text-muted-foreground mt-1">
              {q ? "Try a different search term" : "No files match this filter"}
            </p>
          </motion.div>
        ) : !hasResults ? (
          <motion.div
            key={`upload-${viewKey}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className={cn(
              "flex flex-col items-center justify-center py-16 text-center rounded-xl border cursor-pointer transition-colors",
              dragOver ? "border-primary ring-2 ring-primary/20 bg-primary/5" : "bg-card"
            )}
            onClick={handleFileInput}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
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
          </motion.div>
        ) : (
          <motion.div
            key={`browser-${viewKey}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
              className={cn(
                "rounded-xl border overflow-hidden transition-colors",
                dragOver ? "border-primary ring-2 ring-primary/20" : "bg-card"
              )}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
            >
              {/* Column header */}
              <div className="flex items-center gap-3 px-4 py-2 bg-muted/30 border-b">
                <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide flex-1">Name</span>
                <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide w-20 text-right hidden sm:block">Size</span>
                <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide w-24 text-right hidden sm:block">Date</span>
                <span className="w-16 shrink-0" />
              </div>

              {/* Folder rows */}
              {filteredFolders.map((folder, i) => (
                <motion.div
                  key={folder.id}
                  custom={i}
                  variants={ROW_VARIANTS}
                  initial="hidden"
                  animate="visible"
                  className="flex items-center gap-3 px-4 py-2.5 border-b last:border-b-0 hover:bg-muted/50 transition-colors group"
                >
                  <div
                    className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer"
                    role="button"
                    tabIndex={0}
                    onClick={() => navigateToFolder(folder.id)}
                    onKeyDown={(e) => { if (e.key === "Enter") navigateToFolder(folder.id); }}
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
                </motion.div>
              ))}

              {/* File rows */}
              {filteredDocs.map((doc, i) => {
                const { icon: FileIcon, color: iconColor } = getFileIcon(doc.mimeType);
                return (
                  <motion.div
                    key={doc.id}
                    custom={filteredFolders.length + i}
                    variants={ROW_VARIANTS}
                    initial="hidden"
                    animate="visible"
                    className="flex items-center gap-3 px-4 py-2.5 border-b last:border-b-0 hover:bg-muted/50 transition-colors group cursor-pointer"
                    onClick={() => openFileSheet(doc)}
                  >
                    <FileIcon className={cn("size-5 shrink-0", iconColor)} />
                    <span className="text-sm font-medium truncate min-w-0 flex-1">{doc.fileName}</span>
                    {doc.visibility === "private" && (
                      <Badge variant="outline" className="shrink-0 text-[10px] gap-1 px-1.5 py-0 h-5 border-amber-200 text-amber-700 dark:border-amber-800 dark:text-amber-400">
                        <Lock className="size-2.5" />
                        Private
                      </Badge>
                    )}
                    <span className="text-[11px] text-muted-foreground tabular-nums w-20 text-right hidden sm:block">
                      {formatFileSize(doc.fileSize)}
                    </span>
                    <span className="text-[11px] text-muted-foreground w-24 text-right hidden sm:block">
                      {new Date(doc.createdAt).toLocaleDateString()}
                    </span>
                    <div className="w-16 shrink-0 flex justify-end" onClick={(e) => e.stopPropagation()}>
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
                          <DropdownMenuItem onClick={() => handleDownload(doc)}>
                            <Download className="size-4" /> Download
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleToggleVisibility(doc)}>
                            {doc.visibility === "private" ? (
                              <><Users className="size-4" /> Share with team</>
                            ) : (
                              <><Lock className="size-4" /> Make private</>
                            )}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => handleDeleteDoc(doc)}
                          >
                            <Trash2 className="size-4" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </motion.div>
                );
              })}
            </motion.div>
        )}
      </AnimatePresence>

      {/* File detail sheet */}
      <Sheet open={!!selectedDoc} onOpenChange={(open) => { if (!open) { setSelectedDoc(null); setEditingName(false); setPreviewUrl(null); } }}>
        <SheetContent>
          {selectedDoc && (() => {
            const { icon: SheetFileIcon, color: sheetIconColor } = getFileIcon(selectedDoc.mimeType);
            return (
              <>
                <SheetHeader>
                  <SheetTitle>File Details</SheetTitle>
                  <SheetDescription className="sr-only">View and edit file</SheetDescription>
                </SheetHeader>

                <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-5">
                  {/* Preview area */}
                  {previewLoading ? (
                    <div className="flex flex-col items-center justify-center rounded-xl bg-muted/50 border py-12">
                      <div className="size-6 border-2 border-muted-foreground/20 border-t-muted-foreground rounded-full animate-spin" />
                      <p className="mt-3 text-[11px] text-muted-foreground">Loading preview...</p>
                    </div>
                  ) : previewUrl && selectedDoc.mimeType.startsWith("image/") ? (
                    <button
                      onClick={() => window.open(previewUrl, "_blank")}
                      className="rounded-xl border overflow-hidden bg-[repeating-conic-gradient(#80808015_0%_25%,transparent_0%_50%)] bg-[length:16px_16px] group/preview relative cursor-pointer"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={previewUrl}
                        alt={selectedDoc.fileName}
                        className="w-full max-h-64 object-contain"
                      />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover/preview:bg-black/40 transition-colors">
                        <ExternalLink className="size-5 text-white opacity-0 group-hover/preview:opacity-100 transition-opacity" />
                      </div>
                    </button>
                  ) : previewUrl && selectedDoc.mimeType === "application/pdf" ? (
                    <div className="rounded-xl border overflow-hidden relative group/preview">
                      <iframe
                        src={previewUrl}
                        className="w-full h-64 border-0"
                        title={selectedDoc.fileName}
                      />
                      <button
                        onClick={() => window.open(previewUrl, "_blank")}
                        className="absolute top-2 right-2 flex items-center gap-1.5 rounded-lg bg-background/90 backdrop-blur-sm border shadow-sm px-2.5 py-1.5 text-[11px] font-medium opacity-0 group-hover/preview:opacity-100 transition-opacity hover:bg-background"
                      >
                        <ExternalLink className="size-3" />
                        Open
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center rounded-xl bg-muted/50 border py-8">
                      <div className="flex size-16 items-center justify-center rounded-2xl bg-background shadow-sm ring-1 ring-border">
                        <SheetFileIcon className={cn("size-7", sheetIconColor)} />
                      </div>
                      <p className="mt-3 text-[11px] text-muted-foreground font-mono tabular-nums">
                        {formatFileSize(selectedDoc.fileSize)}
                      </p>
                    </div>
                  )}

                  {/* Editable name */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium">File name</label>
                    {editingName ? (
                      <div className="flex items-center gap-1.5">
                        <Input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleRename(selectedDoc, editName);
                            if (e.key === "Escape") setEditingName(false);
                          }}
                          className="h-9 text-sm"
                          autoFocus
                          disabled={savingName}
                        />
                        <Button
                          variant="outline"
                          size="icon"
                          className="size-9 shrink-0"
                          onClick={() => handleRename(selectedDoc, editName)}
                          disabled={savingName}
                        >
                          <CheckIcon className="size-3.5 text-emerald-600" />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          className="size-9 shrink-0"
                          onClick={() => setEditingName(false)}
                          disabled={savingName}
                        >
                          <X className="size-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setEditName(selectedDoc.fileName); setEditingName(true); }}
                        className="flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left hover:bg-muted/50 transition-colors group/name"
                      >
                        <span className="text-sm font-medium truncate flex-1">{selectedDoc.fileName}</span>
                        <Pencil className="size-3 shrink-0 text-muted-foreground opacity-0 group-hover/name:opacity-100 transition-opacity" />
                      </button>
                    )}
                  </div>

                  {/* Visibility */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium">Visibility</label>
                    <Select
                      value={selectedDoc.visibility}
                      onValueChange={(v) => handleToggleVisibility({ ...selectedDoc, visibility: v === "private" ? "organization" : "private" })}
                    >
                      <SelectTrigger className="h-9 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="organization">
                          <div className="flex items-center gap-2">
                            <Users className="size-3.5 text-muted-foreground" />
                            <span>Shared with team</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="private">
                          <div className="flex items-center gap-2">
                            <Lock className="size-3.5 text-muted-foreground" />
                            <span>Private (only you)</span>
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Metadata */}
                  <div className="rounded-lg border divide-y">
                    <div className="flex items-center justify-between px-3 py-2.5">
                      <span className="text-xs text-muted-foreground">Type</span>
                      <span className="text-xs font-medium">{selectedDoc.mimeType.split("/").pop()?.toUpperCase()}</span>
                    </div>
                    <div className="flex items-center justify-between px-3 py-2.5">
                      <span className="text-xs text-muted-foreground">Size</span>
                      <span className="text-xs font-medium font-mono tabular-nums">{formatFileSize(selectedDoc.fileSize)}</span>
                    </div>
                    <div className="flex items-center justify-between px-3 py-2.5">
                      <span className="text-xs text-muted-foreground">Uploaded</span>
                      <span className="text-xs font-medium">{new Date(selectedDoc.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 pt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 gap-2 text-xs h-9"
                      onClick={() => handleDownload(selectedDoc)}
                    >
                      <Download className="size-3.5" />
                      Download
                    </Button>
                    <Button
                      size="sm"
                      className="flex-1 gap-2 text-xs h-9 bg-emerald-600 hover:bg-emerald-700"
                      onClick={async () => {
                        if (previewUrl) {
                          window.open(previewUrl, "_blank");
                        } else {
                          const orgId = localStorage.getItem("activeOrgId") || "";
                          const res = await fetch(`/api/v1/documents/${selectedDoc.id}/download`, {
                            headers: { "x-organization-id": orgId },
                          });
                          const data = await res.json();
                          if (data.downloadUrl) window.open(data.downloadUrl, "_blank");
                        }
                      }}
                    >
                      <ExternalLink className="size-3.5" />
                      Open
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2 text-xs h-9 text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200 dark:text-red-400 dark:hover:text-red-300 dark:hover:bg-red-950/30 dark:border-red-900/50"
                      onClick={() => {
                        const doc = selectedDoc;
                        setSelectedDoc(null);
                        handleDeleteDoc(doc);
                      }}
                    >
                      <Trash2 className="size-3.5" />
                      Delete
                    </Button>
                  </div>
                </div>
              </>
            );
          })()}
        </SheetContent>
      </Sheet>

      {uploadDialog}
      {folderDialog}
      {confirmDialog}
    </ContentReveal>
  );
}
