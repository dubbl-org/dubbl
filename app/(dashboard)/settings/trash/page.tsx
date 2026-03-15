"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { Trash2, Search, RotateCcw, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ContentReveal } from "@/components/ui/content-reveal";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

interface TrashItem {
  id: string;
  name: string | null;
  entityType: string;
  label: string;
  deletedAt: string;
}

const ENTITY_TYPES = [
  { value: "contact", label: "Contact" },
  { value: "invoice", label: "Invoice" },
  { value: "bill", label: "Bill" },
  { value: "account", label: "Account" },
  { value: "journal_entry", label: "Journal Entry" },
  { value: "product", label: "Product" },
  { value: "expense", label: "Expense" },
  { value: "quote", label: "Quote" },
  { value: "credit_note", label: "Credit Note" },
  { value: "debit_note", label: "Debit Note" },
  { value: "purchase_order", label: "Purchase Order" },
  { value: "bank_account", label: "Bank Account" },
  { value: "payment", label: "Payment" },
  { value: "recurring_template", label: "Recurring Template" },
  { value: "project", label: "Project" },
  { value: "fixed_asset", label: "Fixed Asset" },
  { value: "budget", label: "Budget" },
  { value: "loan", label: "Loan" },
  { value: "document", label: "Document" },
  { value: "document_template", label: "Template" },
];

function getRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

function getEntityLabel(entityType: string): string {
  return ENTITY_TYPES.find((e) => e.value === entityType)?.label || entityType;
}

export default function TrashPage() {
  const [items, setItems] = useState<TrashItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [deleteItem, setDeleteItem] = useState<TrashItem | null>(null);
  const [emptyOpen, setEmptyOpen] = useState(false);
  const [acting, setActing] = useState(false);

  const fetchItems = useCallback(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    const params = new URLSearchParams();
    if (typeFilter !== "all") params.set("entityType", typeFilter);
    if (search.trim()) params.set("search", search.trim());

    fetch(`/api/v1/trash?${params}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => setItems(data.data || []))
      .finally(() => setLoading(false));
  }, [typeFilter, search]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const filteredItems = useMemo(() => {
    return items;
  }, [items]);

  const handleRestore = async (item: TrashItem) => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    try {
      const res = await fetch(`/api/v1/trash/${item.id}/restore`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-organization-id": orgId,
        },
        body: JSON.stringify({ entityType: item.entityType }),
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "Failed to restore item");
        return;
      }

      toast.success(`${item.label} restored`);
      fetchItems();
    } catch {
      toast.error("Failed to restore item");
    }
  };

  const confirmDeletePermanently = async () => {
    if (!deleteItem) return;
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    setActing(true);
    try {
      const res = await fetch(`/api/v1/trash/${deleteItem.id}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "x-organization-id": orgId,
        },
        body: JSON.stringify({ entityType: deleteItem.entityType }),
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "Failed to delete item");
        return;
      }

      toast.success(`${deleteItem.label} permanently deleted`);
      setDeleteItem(null);
      fetchItems();
    } catch {
      toast.error("Failed to delete item");
    } finally {
      setActing(false);
    }
  };

  const confirmEmptyTrash = async () => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    setActing(true);
    try {
      const res = await fetch("/api/v1/trash/empty", {
        method: "POST",
        headers: { "x-organization-id": orgId },
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "Failed to empty trash");
        return;
      }

      toast.success("Trash emptied");
      setEmptyOpen(false);
      fetchItems();
    } catch {
      toast.error("Failed to empty trash");
    } finally {
      setActing(false);
    }
  };

  return (
    <ContentReveal>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Trash</h2>
            <p className="text-sm text-muted-foreground">
              Deleted items are kept for 30 days before permanent removal
            </p>
          </div>
          {filteredItems.length > 0 && (
            <Button
              variant="destructive"
              size="sm"
              className="h-8 text-xs gap-1.5"
              onClick={() => setEmptyOpen(true)}
            >
              <Trash2 className="size-3.5" />
              Empty Trash
            </Button>
          )}
        </div>

        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <Input
              placeholder="Search deleted items..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 text-sm"
            />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[180px] h-8 text-sm">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {ENTITY_TYPES.map((type) => (
                <SelectItem key={type.value} value={type.value}>
                  {type.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="rounded-full bg-muted p-3 mb-3">
              <Trash2 className="size-6 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">Trash is empty</p>
            <p className="text-xs text-muted-foreground mt-1">
              Deleted items will appear here
            </p>
          </div>
        ) : (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Deleted</TableHead>
                  <TableHead className="w-[120px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredItems.map((item) => (
                  <TableRow key={`${item.entityType}-${item.id}`}>
                    <TableCell className="font-medium text-sm">
                      {item.name || "-"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-xs">
                        {getEntityLabel(item.entityType)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {getRelativeTime(item.deletedAt)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          title="Restore"
                          onClick={() => handleRestore(item)}
                        >
                          <RotateCcw className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 text-red-600"
                          title="Delete permanently"
                          onClick={() => setDeleteItem(item)}
                        >
                          <X className="size-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Permanent delete confirmation */}
      <Dialog open={!!deleteItem} onOpenChange={(o) => !o && setDeleteItem(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete permanently?</DialogTitle>
            <DialogDescription>
              This will permanently delete &quot;{deleteItem?.name || deleteItem?.label}&quot;.
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteItem(null)} disabled={acting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDeletePermanently} disabled={acting}>
              {acting ? "Deleting..." : "Delete permanently"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Empty trash confirmation */}
      <Dialog open={emptyOpen} onOpenChange={setEmptyOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Empty trash?</DialogTitle>
            <DialogDescription>
              This will permanently delete all {filteredItems.length} items in trash.
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEmptyOpen(false)} disabled={acting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmEmptyTrash} disabled={acting}>
              {acting ? "Emptying..." : "Empty trash"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ContentReveal>
  );
}
