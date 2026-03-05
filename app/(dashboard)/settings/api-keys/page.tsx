"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Plus, Key, Copy, Trash2 } from "lucide-react";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { BlurReveal } from "@/components/ui/blur-reveal";

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

  return (
    <BlurReveal className="space-y-10">
      {/* API Keys section */}
      <section className="grid gap-6 sm:grid-cols-[200px_1fr] sm:gap-10">
        <div className="shrink-0">
          <p className="text-sm font-medium">API keys</p>
          <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
            Create and manage API keys for programmatic access to the dubbl API.
          </p>
        </div>
        <div className="min-w-0 space-y-4">
          <div className="flex items-center justify-between">
            {keys.length > 0 ? (
              <p className="text-[12px] text-muted-foreground">
                {keys.length} key{keys.length !== 1 ? "s" : ""} active
              </p>
            ) : (
              <div />
            )}
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

          {!loading && keys.length === 0 ? (
            <EmptyState
              icon={Key}
              title="No API keys"
              description="Create an API key to access the dubbl API programmatically."
            />
          ) : (
            <div className="divide-y rounded-lg border">
              {keys.map((k) => (
                <div key={k.id} className="flex items-center justify-between p-4">
                  <div>
                    <p className="text-sm font-medium">{k.name}</p>
                    <p className="text-xs font-mono text-muted-foreground">
                      {k.keyPrefix}...
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {k.lastUsedAt ? `Last used ${k.lastUsedAt}` : "Never used"}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-red-600 hover:text-red-700"
                      onClick={() => deleteKey(k.id)}
                      disabled={deletingId === k.id}
                    >
                      <Trash2 className={deletingId === k.id ? "size-3.5 animate-pulse" : "size-3.5"} />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <div className="h-px bg-border" />

      {/* Usage note */}
      <section className="grid gap-6 sm:grid-cols-[200px_1fr] sm:gap-10">
        <div className="shrink-0">
          <p className="text-sm font-medium">Usage</p>
          <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
            How to authenticate API requests.
          </p>
        </div>
        <div className="min-w-0 rounded-lg border border-border p-4">
          <p className="text-[12px] text-muted-foreground">
            Include your API key in the <code className="rounded bg-muted px-1 py-0.5 text-[11px] font-mono">Authorization</code> header:
          </p>
          <div className="mt-3 rounded-md bg-muted p-3">
            <code className="text-[11px] font-mono text-foreground">
              Authorization: Bearer dk_live_...
            </code>
          </div>
          <p className="mt-3 text-[12px] text-muted-foreground">
            Keys are scoped to the organization they were created in. Keep them secret and rotate regularly.
          </p>
        </div>
      </section>

      <Dialog
        open={createOpen}
        onOpenChange={(v) => {
          setCreateOpen(v);
          if (!v) setNewKey(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {newKey ? "API Key Created" : "New API Key"}
            </DialogTitle>
            {newKey && (
              <DialogDescription>
                Copy this key now. You won&apos;t be able to see it again.
              </DialogDescription>
            )}
          </DialogHeader>
          {newKey ? (
            <div className="space-y-3">
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
            <div className="space-y-4">
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
          <DialogFooter>
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
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </BlurReveal>
  );
}
