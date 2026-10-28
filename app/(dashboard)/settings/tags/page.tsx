"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { EmptyState } from "@/components/dashboard/empty-state";
import { ContentReveal } from "@/components/ui/content-reveal";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Pencil, Trash2, Tags } from "lucide-react";
import { toast } from "sonner";

interface Tag {
  id: string;
  name: string;
  color: string;
  description: string | null;
  createdAt: string;
}

const TAG_COLORS = [
  { label: "gray", value: "#6b7280" },
  { label: "red", value: "#ef4444" },
  { label: "orange", value: "#f97316" },
  { label: "amber", value: "#f59e0b" },
  { label: "green", value: "#22c55e" },
  { label: "teal", value: "#14b8a6" },
  { label: "blue", value: "#3b82f6" },
  { label: "indigo", value: "#6366f1" },
  { label: "purple", value: "#a855f7" },
  { label: "pink", value: "#ec4899" },
];

export default function TagsPage() {
  const t = useTranslations("Settings.Tags");
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingTag, setEditingTag] = useState<Tag | null>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#6b7280");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  useDocumentTitle(t("pageTitle"));

  const fetchTags = useCallback(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;
    fetch("/api/v1/tags", {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => setTags(data.tags || []))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchTags();
  }, [fetchTags]);

  const openCreate = () => {
    setEditingTag(null);
    setName("");
    setColor("#6b7280");
    setDescription("");
    setSheetOpen(true);
  };

  const openEdit = (tag: Tag) => {
    setEditingTag(tag);
    setName(tag.name);
    setColor(tag.color);
    setDescription(tag.description || "");
    setSheetOpen(true);
  };

  const handleSave = async () => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId || !name.trim()) return;
    setSaving(true);

    const url = editingTag ? `/api/v1/tags/${editingTag.id}` : "/api/v1/tags";
    const method = editingTag ? "PUT" : "POST";

    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify({ name: name.trim(), color, description: description.trim() || null }),
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || t("saveFailed"));
        return;
      }

      toast.success(editingTag ? t("updated") : t("created"));
      setSheetOpen(false);
      fetchTags();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    const res = await fetch(`/api/v1/tags/${id}`, {
      method: "DELETE",
      headers: { "x-organization-id": orgId },
    });

    if (res.ok) {
      toast.success(t("deleted"));
      fetchTags();
    } else {
      toast.error(t("deleteFailed"));
    }
  };

  return (
    <ContentReveal>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">{t("title")}</h2>
            <p className="text-sm text-muted-foreground">
              {t("description")}
            </p>
          </div>
          <Button size="sm" className="h-8 text-xs gap-1.5" onClick={openCreate}>
            <Plus className="size-3.5" />
            {t("addTag")}
          </Button>
        </div>

        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : tags.length === 0 ? (
          <EmptyState
            icon={Tags}
            title={t("emptyTitle")}
            description={t("emptyDescription")}
          >
            <Button size="sm" className="h-8 text-xs gap-1.5 mt-3" onClick={openCreate}>
              <Plus className="size-3.5" />
              {t("createTag")}
            </Button>
          </EmptyState>
        ) : (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("color")}</TableHead>
                  <TableHead>{t("name")}</TableHead>
                  <TableHead>{t("tagDescription")}</TableHead>
                  <TableHead className="w-[100px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {tags.map((tag) => (
                  <TableRow key={tag.id}>
                    <TableCell>
                      <div
                        className="size-4 rounded-full"
                        style={{ backgroundColor: tag.color }}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{tag.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {tag.description || "-"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          onClick={() => openEdit(tag)}
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 text-red-600"
                          onClick={() => handleDelete(tag.id)}
                        >
                          <Trash2 className="size-3.5" />
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

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent>
          <SheetHeader>
          <SheetTitle>{editingTag ? t("editTag") : t("newTag")}</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 px-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">{t("name")}</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("namePlaceholder")}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{t("color")}</label>
              <div className="flex flex-wrap gap-2">
                {TAG_COLORS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    className={`size-7 rounded-full transition-all ${
                      color === c.value ? "ring-2 ring-offset-2 ring-primary" : "hover:scale-110"
                    }`}
                    style={{ backgroundColor: c.value }}
                    onClick={() => setColor(c.value)}
                    title={t(`colors.${c.label}`)}
                  />
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{t("tagDescription")}</label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t("optionalDescription")}
              />
            </div>
          </div>
          <SheetFooter>
            <Button onClick={handleSave} disabled={saving || !name.trim()} className="w-full">
              {saving ? t("saving") : editingTag ? t("update") : t("create")}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </ContentReveal>
  );
}
