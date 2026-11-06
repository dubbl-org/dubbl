"use client";

import { useState } from "react";
import { X, Plus, Tags } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useApi, useApiCache } from "@/lib/query/use-api";
import type { TaggableEntityType } from "@/lib/api/tags";

interface Tag {
  id: string;
  name: string;
  color: string;
}

const TAGS_URL = "/api/v1/tags";

/** URL of the tags attached to one record (GET /api/v1/tags/record). */
export function recordTagsUrl(entityType: TaggableEntityType, entityId: string) {
  return `/api/v1/tags/record?${new URLSearchParams({ entityType, entityId })}`;
}

/** A small read-only chip for one tag, as shown on records and in lists. */
export function TagChip({
  tag,
  onRemove,
}: {
  tag: Tag;
  onRemove?: () => void;
}) {
  return (
    <span className="inline-flex max-w-[12rem] items-center gap-1.5 rounded-full border bg-muted/50 px-2 py-0.5 text-[11px] font-medium">
      <span
        className="size-2 shrink-0 rounded-full"
        style={{ backgroundColor: tag.color }}
      />
      <span className="truncate">{tag.name}</span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="text-muted-foreground hover:text-foreground"
          aria-label={`Remove tag ${tag.name}`}
        >
          <X className="size-2.5" />
        </button>
      )}
    </span>
  );
}

interface TagPickerProps {
  entityType: TaggableEntityType;
  entityId: string;
  className?: string;
}

/**
 * The tags on one record, with an "Add tags" popover to attach existing tags
 * or create a new one, and an x on each chip to remove it.
 */
export function TagPicker({ entityType, entityId, className }: TagPickerProps) {
  const { data } = useApi<{ tags?: Tag[] }>(TAGS_URL);
  const allTags = data?.tags ?? [];
  const recordUrl = recordTagsUrl(entityType, entityId);
  const { data: recordData } = useApi<{ tags?: Tag[] }>(recordUrl);
  const attachedTags = recordData?.tags ?? [];
  const cache = useApiCache();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);

  const getOrgId = () => localStorage.getItem("activeOrgId") || "";

  const post = (url: string, body: unknown) =>
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-organization-id": getOrgId() },
      body: JSON.stringify(body),
    });

  const attachTag = async (tag: Tag) => {
    await cache.cancel(recordUrl);
    cache.update<{ tags?: Tag[] }>(recordUrl, (d) => ({
      ...d,
      tags: [...(d.tags ?? []).filter((t) => t.id !== tag.id), tag].sort((a, b) =>
        a.name.localeCompare(b.name)
      ),
    }));
    const res = await post("/api/v1/tags/attach", { tagId: tag.id, entityType, entityId });
    if (!res.ok) {
      toast.error("Couldn't add the tag");
      cache.invalidate(recordUrl);
    }
  };

  const detachTag = async (tag: Tag) => {
    await cache.cancel(recordUrl);
    cache.update<{ tags?: Tag[] }>(recordUrl, (d) => ({
      ...d,
      tags: (d.tags ?? []).filter((t) => t.id !== tag.id),
    }));
    const res = await post("/api/v1/tags/detach", { tagId: tag.id, entityType, entityId });
    if (!res.ok) {
      toast.error("Couldn't remove the tag");
      cache.invalidate(recordUrl);
    }
  };

  const createAndAttach = async () => {
    if (!search.trim()) return;
    setCreating(true);
    try {
      const res = await post(TAGS_URL, { name: search.trim() });
      if (!res.ok) {
        toast.error("Couldn't create the tag");
        return;
      }
      const created = await res.json();
      cache.update<{ tags?: Tag[] }>(TAGS_URL, (d) => ({ ...d, tags: [...(d.tags ?? []), created.tag] }));
      await attachTag(created.tag);
      setSearch("");
    } finally {
      setCreating(false);
    }
  };

  const attachedIds = new Set(attachedTags.map((t) => t.id));
  const filtered = allTags.filter(
    (t) =>
      !attachedIds.has(t.id) &&
      t.name.toLowerCase().includes(search.toLowerCase())
  );
  const exactMatch = allTags.some(
    (t) => t.name.toLowerCase() === search.trim().toLowerCase()
  );

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {attachedTags.map((tag) => (
        <TagChip key={tag.id} tag={tag} onRemove={() => detachTag(tag)} />
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
            {attachedTags.length === 0 ? "Add tags" : "Add"}
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
                onClick={() => attachTag(tag)}
              >
                <div
                  className="size-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: tag.color }}
                />
                {tag.name}
              </button>
            ))}
            {search.trim() && !exactMatch && (
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
