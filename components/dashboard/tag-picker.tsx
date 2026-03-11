"use client";

import { useState, useEffect, useCallback } from "react";
import { X, Plus, Tags } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface Tag {
  id: string;
  name: string;
  color: string;
}

interface TagPickerProps {
  entityType: string;
  entityId: string;
  className?: string;
}

export function TagPicker({ entityType, entityId, className }: TagPickerProps) {
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [attachedTagIds, setAttachedTagIds] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);

  const getOrgId = () => localStorage.getItem("activeOrgId") || "";

  const fetchTags = useCallback(() => {
    const orgId = getOrgId();
    if (!orgId) return;
    fetch("/api/v1/tags", {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => setAllTags(data.tags || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchTags();
  }, [fetchTags]);

  const attachTag = async (tagId: string) => {
    const orgId = getOrgId();
    const res = await fetch("/api/v1/tags/attach", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-organization-id": orgId },
      body: JSON.stringify({ tagId, entityType, entityId }),
    });
    if (res.ok) {
      setAttachedTagIds((prev) => new Set([...prev, tagId]));
    }
  };

  const detachTag = async (tagId: string) => {
    const orgId = getOrgId();
    await fetch("/api/v1/tags/detach", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-organization-id": orgId },
      body: JSON.stringify({ tagId, entityType, entityId }),
    });
    setAttachedTagIds((prev) => {
      const next = new Set(prev);
      next.delete(tagId);
      return next;
    });
  };

  const createAndAttach = async () => {
    if (!search.trim()) return;
    const orgId = getOrgId();
    setCreating(true);
    try {
      const res = await fetch("/api/v1/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify({ name: search.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        setAllTags((prev) => [...prev, data.tag]);
        await attachTag(data.tag.id);
        setSearch("");
      }
    } finally {
      setCreating(false);
    }
  };

  const attachedTags = allTags.filter((t) => attachedTagIds.has(t.id));
  const filtered = allTags.filter(
    (t) =>
      !attachedTagIds.has(t.id) &&
      t.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {attachedTags.map((tag) => (
        <span
          key={tag.id}
          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium text-white"
          style={{ backgroundColor: tag.color }}
        >
          {tag.name}
          <button
            type="button"
            onClick={() => detachTag(tag.id)}
            className="hover:opacity-70"
          >
            <X className="size-2.5" />
          </button>
        </span>
      ))}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-1.5 text-[11px] text-muted-foreground gap-1"
          >
            <Tags className="size-3" />
            {attachedTags.length === 0 ? "Add tags" : "+"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-2" align="start">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search or create..."
            className="h-7 text-xs mb-2"
          />
          <div className="max-h-40 overflow-y-auto space-y-0.5">
            {filtered.map((tag) => (
              <button
                key={tag.id}
                type="button"
                className="flex w-full items-center gap-2 rounded px-2 py-1 text-xs hover:bg-muted"
                onClick={() => attachTag(tag.id)}
              >
                <div
                  className="size-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: tag.color }}
                />
                {tag.name}
              </button>
            ))}
            {filtered.length === 0 && search.trim() && (
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded px-2 py-1 text-xs hover:bg-muted text-muted-foreground"
                onClick={createAndAttach}
                disabled={creating}
              >
                <Plus className="size-3" />
                Create &quot;{search.trim()}&quot;
              </button>
            )}
            {filtered.length === 0 && !search.trim() && (
              <p className="text-xs text-muted-foreground px-2 py-1">
                No more tags available
              </p>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
