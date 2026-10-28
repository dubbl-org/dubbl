"use client";

import { useState, useEffect } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Plus, Key, Copy, Trash2, Loader2, Calendar, Clock, Lock, ArrowUpRight } from "lucide-react";
import { useRouter } from "next/navigation";
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
  const t = useTranslations("Settings.ApiKeys");
  const format = useFormatter();
  const router = useRouter();
  const [keys, setKeys] = useState<ApiKeyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [newKey, setNewKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [apiAccess, setApiAccess] = useState(true);
  const [maxKeys, setMaxKeys] = useState(20);

  function fetchKeys() {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    fetch("/api/v1/api-keys", {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.keys) setKeys(data.keys);
        if (data.apiAccess !== undefined) setApiAccess(data.apiAccess);
        if (data.maxKeys) setMaxKeys(data.maxKeys);
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
      const data = await res.json();
      if (!res.ok) throw new Error(t("createFailed"));
      setNewKey(data.plainKey);
      setName("");
      fetchKeys();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("createFailed"));
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
      toast.success(t("revoked"));
      fetchKeys();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("revokeFailed"));
    } finally { setDeletingId(null); }
  }

  const baseUrl = process.env.NEXT_PUBLIC_URL || "https://dubbl.dev";
  const curlExample = `curl -X GET ${baseUrl}/api/v1/invoices \\
  -H "Authorization: Bearer dk_live_..."`;

  return (
    <ContentReveal className="space-y-8">
      {/* Pro required banner */}
      {!apiAccess && !loading && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/30">
          <Lock className="size-4 text-amber-600 dark:text-amber-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-amber-800 dark:text-amber-200">{t("proFeature")}</p>
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
              {t("proRequired")}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0 text-xs border-amber-200 text-amber-700 hover:bg-amber-100 dark:border-amber-800 dark:text-amber-300"
            onClick={() => router.push("/settings/billing")}
          >
            {t("upgrade")}
            <ArrowUpRight className="ml-1 size-3" />
          </Button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{t("title")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("description")}
            {keys.length > 0 && (
              <span className="ml-2 inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                {keys.length}/{maxKeys}
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
          disabled={!apiAccess || keys.length >= maxKeys}
          className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50"
        >
          <Plus className="mr-1.5 size-3.5" />
          {t("newKey")}
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
          title={t("emptyTitle")}
          description={t("emptyDescription")}
        >
          <Button
            size="sm"
            onClick={() => {
              setNewKey(null);
              setCreateOpen(true);
            }}
            disabled={!apiAccess}
            className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50"
          >
            <Plus className="mr-1.5 size-3.5" />
            {t("createFirstKey")}
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
                  <span>{k.lastUsedAt ? t("usedOn", { date: format.dateTime(new Date(k.lastUsedAt), { dateStyle: "medium" }) }) : t("neverUsed")}</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Calendar className="size-3" />
                  <span>{t("createdOn", { date: format.dateTime(new Date(k.createdAt), { dateStyle: "medium" }) })}</span>
                </div>
              </div>

              {/* Delete */}
              <Button
                variant="ghost"
                size="icon"
                className="size-8 shrink-0 text-red-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30"
                aria-label={t("revokeKeyAria", { name: k.name })}
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
        <h3 className="text-sm font-medium">{t("authentication")}</h3>
        <div className="overflow-hidden rounded-xl border bg-zinc-950 dark:bg-zinc-900">
          <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2.5">
            <span className="text-xs font-medium text-zinc-400">{t("exampleRequest")}</span>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
                aria-label={t("copyExample")}
              onClick={() => {
                navigator.clipboard.writeText(curlExample);
                toast.success(t("copied"));
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
          {t.rich("authenticationHelp", {
            header: (chunks) => (
              <code className="rounded bg-muted px-1 py-0.5 text-[11px] font-mono">{chunks}</code>
            ),
          })}
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
              {newKey ? t("keyCreated") : t("newKey")}
            </SheetTitle>
            {newKey && (
              <SheetDescription>
                {t("copyKeyWarning")}
              </SheetDescription>
            )}
          </SheetHeader>
          {newKey ? (
            <div className="space-y-3 px-4 py-4">
              <div className="flex items-center gap-2 rounded-lg bg-muted p-3">
                <code className="flex-1 text-xs font-mono break-all">
                  {newKey}
                </code>
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0 size-8"
                  aria-label={t("copyKey")}
                  onClick={() => {
                    navigator.clipboard.writeText(newKey);
                    toast.success(t("copied"));
                  }}
                >
                  <Copy className="size-3.5" />
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4 px-4 py-4">
              <div className="space-y-2">
                <Label>{t("name")}</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("namePlaceholder")}
                />
              </div>
            </div>
          )}
          <SheetFooter>
            {newKey ? (
              <Button onClick={() => setCreateOpen(false)}>{t("done")}</Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => setCreateOpen(false)}>
                  {t("cancel")}
                </Button>
                <Button
                  onClick={createKey}
                  disabled={!name || saving}
                  className="bg-emerald-600 hover:bg-emerald-700"
                >
                  {saving ? t("creating") : t("createKey")}
                </Button>
              </>
            )}
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </ContentReveal>
  );
}
