"use client";

import { useState, useEffect, useCallback } from "react";
import { Tag, Plus, Pencil, Trash2, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { EmptyState } from "@/components/dashboard/empty-state";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { ContentReveal } from "@/components/ui/content-reveal";
import { useConfirm } from "@/lib/hooks/use-confirm";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";

interface Category {
  id: string;
  name: string;
  color: string | null;
  description: string | null;
  parentId: string | null;
  children?: Category[];
}

const COLORS = [
  "#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6",
  "#ec4899", "#06b6d4", "#84cc16", "#f97316", "#6366f1",
];

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [flat, setFlat] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [editCategory, setEditCategory] = useState<Category | null>(null);
  const [saving, setSaving] = useState(false);
  const { confirm, dialog: confirmDialog } = useConfirm();
  useDocumentTitle("Inventory · Categories");

  const orgId = typeof window !== "undefined" ? localStorage.getItem("activeOrgId") : null;

  const fetchCategories = useCallback(() => {
    if (!orgId) return;
    fetch("/api/v1/inventory/categories", {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        setCategories(data.data || []);
        setFlat(data.flat || []);
      })
      .finally(() => setLoading(false));
  }, [orgId]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  useEffect(() => {
    function handler() { fetchCategories(); }
    window.addEventListener("refetch-categories", handler);
    return () => window.removeEventListener("refetch-categories", handler);
  }, [fetchCategories]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!orgId) return;
    setSaving(true);
    const form = new FormData(e.currentTarget);

    const body = {
      name: form.get("name") as string,
      color: form.get("color") as string || null,
      description: form.get("description") as string || null,
      parentId: form.get("parentId") as string || null,
    };

    try {
      const isEdit = !!editCategory?.id;
      const url = isEdit
        ? `/api/v1/inventory/categories/${editCategory.id}`
        : "/api/v1/inventory/categories";
      const res = await fetch(url, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed");
      }
      toast.success(isEdit ? "Category updated" : "Category created");
      setEditOpen(false);
      setEditCategory(null);
      fetchCategories();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(cat: Category) {
    const confirmed = await confirm({
      title: `Delete "${cat.name}"?`,
      description: "This will remove the category. Items using it will keep their text category.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!confirmed || !orgId) return;

    try {
      await fetch(`/api/v1/inventory/categories/${cat.id}`, {
        method: "DELETE",
        headers: { "x-organization-id": orgId },
      });
      toast.success("Category deleted");
      fetchCategories();
    } catch {
      toast.error("Failed to delete category");
    }
  }

  if (loading) return <BrandLoader />;

  if (categories.length === 0) {
    return (
      <ContentReveal>
        <EmptyState
          icon={Tag}
          title="No categories yet"
          description="Organize your inventory items with categories."
        >
          <Button
            onClick={() => { setEditCategory(null); setEditOpen(true); }}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            <Plus className="size-3.5 mr-1.5" />
            New Category
          </Button>
        </EmptyState>
      </ContentReveal>
    );
  }

  return (
    <ContentReveal className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{flat.length} categor{flat.length === 1 ? "y" : "ies"}</p>
        </div>
        <Button
          size="sm"
          className="h-8 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700"
          onClick={() => { setEditCategory(null); setEditOpen(true); }}
        >
          <Plus className="size-3" />
          New Category
        </Button>
      </div>

      <div className="rounded-xl border bg-card divide-y">
        {categories.map((cat) => (
          <div key={cat.id}>
            <CategoryRow
              category={cat}
              depth={0}
              onEdit={(c) => { setEditCategory(c); setEditOpen(true); }}
              onDelete={handleDelete}
            />
            {cat.children?.map((child) => (
              <CategoryRow
                key={child.id}
                category={child}
                depth={1}
                onEdit={(c) => { setEditCategory(c); setEditOpen(true); }}
                onDelete={handleDelete}
              />
            ))}
          </div>
        ))}
      </div>

      {/* Edit/Create Sheet */}
      <Sheet open={editOpen} onOpenChange={(v) => { if (!v) { setEditOpen(false); setEditCategory(null); } }}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{editCategory ? "Edit Category" : "New Category"}</SheetTitle>
          </SheetHeader>
          <form onSubmit={handleSubmit} className="space-y-4 px-4">
            <div className="space-y-2">
              <Label htmlFor="cat-name">Name *</Label>
              <Input
                id="cat-name"
                name="name"
                required
                defaultValue={editCategory?.name || ""}
                key={editCategory?.id || "new"}
              />
            </div>
            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex gap-2 flex-wrap">
                {COLORS.map((c) => (
                  <label key={c} className="cursor-pointer">
                    <input type="radio" name="color" value={c} className="sr-only peer" defaultChecked={editCategory?.color === c} />
                    <div
                      className="size-7 rounded-full border-2 border-transparent peer-checked:border-foreground transition-colors"
                      style={{ backgroundColor: c }}
                    />
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cat-parent">Parent Category</Label>
              <select
                id="cat-parent"
                name="parentId"
                className="flex h-9 w-full rounded-md border bg-background px-3 py-1 text-sm"
                defaultValue={editCategory?.parentId || ""}
                key={editCategory?.id || "new-p"}
              >
                <option value="">None (root)</option>
                {flat
                  .filter((c) => c.id !== editCategory?.id && !c.parentId)
                  .map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cat-desc">Description</Label>
              <Textarea
                id="cat-desc"
                name="description"
                rows={2}
                defaultValue={editCategory?.description || ""}
                key={editCategory?.id || "new-d"}
              />
            </div>
            <SheetFooter>
              <Button type="button" variant="outline" onClick={() => { setEditOpen(false); setEditCategory(null); }}>Cancel</Button>
              <Button type="submit" disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
                {saving ? "Saving..." : editCategory ? "Update" : "Create"}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      {confirmDialog}
    </ContentReveal>
  );
}

function CategoryRow({
  category,
  depth,
  onEdit,
  onDelete,
}: {
  category: Category;
  depth: number;
  onEdit: (c: Category) => void;
  onDelete: (c: Category) => void;
}) {
  return (
    <div
      className="group flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors"
      style={{ paddingLeft: `${16 + depth * 24}px` }}
    >
      {depth > 0 && <ChevronRight className="size-3 text-muted-foreground/40" />}
      <div
        className="size-3 rounded-full shrink-0"
        style={{ backgroundColor: category.color || "#94a3b8" }}
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{category.name}</p>
        {category.description && (
          <p className="text-xs text-muted-foreground truncate">{category.description}</p>
        )}
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={() => onEdit(category)}
        >
          <Pencil className="size-3" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 text-red-500 hover:text-red-600"
          onClick={() => onDelete(category)}
        >
          <Trash2 className="size-3" />
        </Button>
      </div>
    </div>
  );
}
