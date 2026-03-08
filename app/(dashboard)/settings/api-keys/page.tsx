"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Plus, Key, Copy, Trash2, Loader2, Calendar, Clock } from "lucide-react";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
  SheetDescription,
} from "@/components/ui/sheet";
import { ContentReveal } from "@/components/ui/content-reveal";

interface ApiKeyItem {
  id: string;
  name: string;
  keyPrefix: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKeyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [newKey, setNewKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function fetchKeys() {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    fetch("/api/v1/api-keys", {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.keys) setKeys(data.keys);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    fetchKeys();
  }, []);

  async function createKey() {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;
    setSaving(true);
    try {
      const res = await fetch("/api/v1/api-keys", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-organization-id": orgId,
        },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      const data = await res.json();
      setNewKey(data.plainKey);
      setName("");
      fetchKeys();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create key");
    } finally {
      setSaving(false);
    }
  }

  async function deleteKey(id: string) {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId || deletingId) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/v1/api-keys/${id}`, {
        method: "DELETE",
        headers: { "x-organization-id": orgId },
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success("API key revoked");
      fetchKeys();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete key");
    } finally { setDeletingId(null); }
  }

  const baseUrl = process.env.NEXT_PUBLIC_URL || "https://dubbl.dev";
  const curlExample = `curl -X GET ${baseUrl}/api/v1/invoices \\
  -H "Authorization: Bearer dk_live_..."`;

  return (
    <ContentReveal className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">API Keys</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Create and manage keys for programmatic access to the dubbl API
            {keys.length > 0 && (
              <span className="ml-2 inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                {keys.length} active
              </span>
            )}
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => {
            setNewKey(null);
            setCreateOpen(true);
          }}
          className="bg-emerald-600 hover:bg-emerald-700"
        >
          <Plus className="mr-1.5 size-3.5" />
          New Key
        </Button>
      </div>

      {/* Keys list */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : keys.length === 0 ? (
        <EmptyState
          icon={Key}
          title="No API keys yet"
          description="Create your first API key to start integrating with the dubbl API programmatically."
        >
          <Button
            size="sm"
            onClick={() => {
              setNewKey(null);
              setCreateOpen(true);
            }}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            <Plus className="mr-1.5 size-3.5" />
            Create your first key
          </Button>
        </EmptyState>
      ) : (
        <div className="rounded-xl border">
          {keys.map((k, i) => (
            <div
              key={k.id}
              className={`flex items-center gap-4 px-5 py-4 ${
                i !== keys.length - 1 ? "border-b" : ""
              }`}
            >
              {/* Key icon */}
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-950/40">
                <Key className="size-4 text-emerald-600 dark:text-emerald-400" />
              </div>

              {/* Name + prefix */}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{k.name}</p>
                <p className="mt-0.5 font-mono text-xs text-muted-foreground truncate">
                  {k.keyPrefix}...
                </p>
              </div>

              {/* Metadata */}
              <div className="hidden items-center gap-6 sm:flex">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock className="size-3" />
                  <span>{k.lastUsedAt ? `Used ${k.lastUsedAt}` : "Never used"}</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Calendar className="size-3" />
                  <span>Created {k.createdAt}</span>
                </div>
              </div>

              {/* Delete */}
              <Button
                variant="ghost"
                size="icon"
                className="size-8 shrink-0 text-red-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30"
                onClick={() => deleteKey(k.id)}
                disabled={deletingId === k.id}
              >
                {deletingId === k.id ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Trash2 className="size-3.5" />
                )}
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Authentication / Usage */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium">Authentication</h3>
        <div className="overflow-hidden rounded-xl border bg-zinc-950 dark:bg-zinc-900">
          <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2.5">
            <span className="text-xs font-medium text-zinc-400">Example request</span>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
              onClick={() => {
                navigator.clipboard.writeText(curlExample);
                toast.success("Copied to clipboard");
              }}
            >
              <Copy className="size-3" />
            </Button>
          </div>
          <pre className="overflow-x-auto p-4 text-[13px] leading-relaxed font-mono text-emerald-400">
            <code>{curlExample}</code>
          </pre>
        </div>
        <p className="text-xs text-muted-foreground">
          Include your API key in the <code className="rounded bg-muted px-1 py-0.5 text-[11px] font-mono">Authorization</code> header as a Bearer token. Keys are scoped to the organization they were created in. Keep them secret and rotate regularly.
        </p>
      </div>

      {/* Create / reveal dialog */}
      <Sheet
        open={createOpen}
        onOpenChange={(v) => {
          setCreateOpen(v);
          if (!v) setNewKey(null);
        }}
      >
        <SheetContent>
          <SheetHeader>
            <SheetTitle>
              {newKey ? "API Key Created" : "New API Key"}
            </SheetTitle>
            {newKey && (
              <SheetDescription>
                Copy this key now. You won&apos;t be able to see it again.
              </SheetDescription>
            )}
          </SheetHeader>
          {newKey ? (
            <div className="space-y-3 px-4">
              <div className="flex items-center gap-2 rounded-lg bg-muted p-3">
                <code className="flex-1 text-xs font-mono break-all">
                  {newKey}
                </code>
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0 size-8"
                  onClick={() => {
                    navigator.clipboard.writeText(newKey);
                    toast.success("Copied to clipboard");
                  }}
                >
                  <Copy className="size-3.5" />
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4 px-4">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Production API"
                />
              </div>
            </div>
          )}
          <SheetFooter>
            {newKey ? (
              <Button onClick={() => setCreateOpen(false)}>Done</Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => setCreateOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={createKey}
                  disabled={!name || saving}
                  className="bg-emerald-600 hover:bg-emerald-700"
                >
                  {saving ? "Creating..." : "Create Key"}
                </Button>
              </>
            )}
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </ContentReveal>
  );
}
