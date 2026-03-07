"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { ContentReveal } from "@/components/ui/content-reveal";
import { useConfirm } from "@/lib/hooks/use-confirm";

interface AccountDetail {
  id: string;
  code: string;
  name: string;
  type: string;
  subType?: string | null;
  description?: string | null;
  currencyCode?: string;
  isActive?: boolean;
}

const TYPE_STYLE: Record<string, string> = {
  asset: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300",
  liability: "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-300",
  equity: "border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-800 dark:bg-purple-950 dark:text-purple-300",
  revenue: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  expense: "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300",
};

export default function AccountSettingsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [account, setAccount] = useState<AccountDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const orgId = typeof window !== "undefined" ? localStorage.getItem("activeOrgId") : null;

  useEffect(() => {
    if (!orgId) return;
    fetch(`/api/v1/accounts/${id}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.account) setAccount(data.account);
      })
      .finally(() => setLoading(false));
  }, [id, orgId]);

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!orgId) return;
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch(`/api/v1/accounts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify({
          code: fd.get("code"),
          name: fd.get("name"),
          subType: fd.get("subType") || null,
          description: fd.get("description") || null,
          isActive: fd.get("isActive") === "true",
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      const data = await res.json();
      setAccount((prev) => prev ? { ...prev, ...data.account } : prev);
      toast.success("Account updated");
      window.dispatchEvent(new CustomEvent("accounts-changed"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivate() {
    if (!orgId || !account) return;
    const willDeactivate = account.isActive !== false;
    await confirm({
      title: willDeactivate ? "Deactivate this account?" : "Reactivate this account?",
      description: willDeactivate
        ? "Inactive accounts won't appear in dropdowns when creating entries. Existing transactions are not affected."
        : "This account will appear in dropdowns again.",
      confirmLabel: willDeactivate ? "Deactivate" : "Reactivate",
      destructive: willDeactivate,
      onConfirm: async () => {
        const res = await fetch(`/api/v1/accounts/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", "x-organization-id": orgId },
          body: JSON.stringify({ isActive: !willDeactivate }),
        });
        if (res.ok) {
          const data = await res.json();
          setAccount((prev) => prev ? { ...prev, ...data.account } : prev);
          toast.success(willDeactivate ? "Account deactivated" : "Account reactivated");
          window.dispatchEvent(new CustomEvent("accounts-changed"));
        } else {
          toast.error("Failed to update account");
        }
      },
    });
  }

  async function handleDelete() {
    if (!orgId) return;
    await confirm({
      title: "Delete this account?",
      description: "This will permanently delete the account. Accounts with existing transactions cannot be deleted.",
      confirmLabel: "Delete Account",
      destructive: true,
      onConfirm: async () => {
        const res = await fetch(`/api/v1/accounts/${id}`, {
          method: "DELETE",
          headers: { "x-organization-id": orgId },
        });
        if (res.ok) {
          toast.success("Account deleted");
          window.dispatchEvent(new CustomEvent("accounts-changed"));
          router.push("/accounting/accounts");
        } else {
          const data = await res.json();
          toast.error(data.error || "Failed to delete account");
        }
      },
    });
  }

  if (loading) return <BrandLoader />;

  if (!account) {
    return <p className="text-muted-foreground">Account not found.</p>;
  }

  const cur = account.currencyCode || "USD";

  return (
    <ContentReveal>
      {/* Back link */}
      <button
        onClick={() => router.push(`/accounting/accounts/${id}`)}
        className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors mb-6"
      >
        <ArrowLeft className="size-3.5" />
        Back to {account.name}
      </button>

      {/* Header */}
      <div className="mb-8">
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-base sm:text-lg font-semibold tracking-tight">Settings</h1>
          <Badge variant="outline" className={TYPE_STYLE[account.type] || ""}>
            {account.type}
          </Badge>
          {account.isActive === false && (
            <Badge variant="outline" className="text-muted-foreground">Inactive</Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground mt-0.5">
          <span className="font-mono">{account.code}</span> · {account.name}
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-10">
        {/* General */}
        <div className="grid gap-6 sm:grid-cols-[200px_1fr] sm:gap-10">
          <div className="shrink-0">
            <p className="text-sm font-medium">General</p>
            <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">Account name, code, and description.</p>
          </div>
          <div className="min-w-0 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Account Code</Label>
                <Input name="code" required defaultValue={account.code} className="font-mono" />
                <p className="text-[11px] text-muted-foreground">Changing the code won't affect existing journal entries.</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Account Name</Label>
                <Input name="name" required defaultValue={account.name} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Sub Type</Label>
              <Input name="subType" defaultValue={account.subType || ""} placeholder="e.g. Current Asset, Fixed Asset..." />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Description</Label>
              <Textarea name="description" defaultValue={account.description || ""} placeholder="Optional notes about this account" rows={3} />
            </div>
          </div>
        </div>

        <div className="h-px bg-border" />

        {/* Status */}
        <div className="grid gap-6 sm:grid-cols-[200px_1fr] sm:gap-10">
          <div className="shrink-0">
            <p className="text-sm font-medium">Status</p>
            <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">Control whether this account appears in dropdowns.</p>
          </div>
          <div className="min-w-0">
            <Select name="isActive" defaultValue={account.isActive === false ? "false" : "true"}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="true">Active</SelectItem>
                <SelectItem value="false">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="h-px bg-border" />

        {/* Read-only info */}
        <div className="grid gap-6 sm:grid-cols-[200px_1fr] sm:gap-10">
          <div className="shrink-0">
            <p className="text-sm font-medium">Info</p>
            <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">These fields cannot be changed after creation.</p>
          </div>
          <div className="min-w-0 grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-[11px] text-muted-foreground">Type</p>
              <p className="text-sm capitalize mt-0.5">{account.type}</p>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground">Currency</p>
              <p className="text-sm mt-0.5">{cur}</p>
            </div>
          </div>
        </div>

        <div className="h-px bg-border" />

        <div className="flex justify-end">
          <Button type="submit" size="sm" loading={saving} className="bg-emerald-600 hover:bg-emerald-700">
            Save changes
          </Button>
        </div>

        <div className="h-px bg-border" />

        {/* Danger zone */}
        <div className="grid gap-6 sm:grid-cols-[200px_1fr] sm:gap-10">
          <div className="shrink-0">
            <p className="text-sm font-medium text-red-600">Danger zone</p>
            <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">Irreversible actions.</p>
          </div>
          <div className="min-w-0 space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-md border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900/50 dark:bg-amber-950/20">
              <div>
                <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
                  {account.isActive !== false ? "Deactivate account" : "Reactivate account"}
                </p>
                <p className="text-[12px] text-muted-foreground">
                  {account.isActive !== false
                    ? "Hide from dropdowns. Existing transactions stay intact."
                    : "Make this account available in dropdowns again."}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                type="button"
                onClick={handleDeactivate}
                className="border-amber-300 text-amber-700 hover:bg-amber-100 dark:border-amber-800 dark:text-amber-400 dark:hover:bg-amber-950"
              >
                {account.isActive !== false ? "Deactivate" : "Reactivate"}
              </Button>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-md border border-red-200 bg-red-50 px-4 py-3 dark:border-red-900/50 dark:bg-red-950/20">
              <div>
                <p className="text-sm font-medium text-red-600 dark:text-red-400">Delete account</p>
                <p className="text-[12px] text-muted-foreground">Accounts with existing transactions cannot be deleted.</p>
              </div>
              <Button variant="destructive" size="sm" type="button" onClick={handleDelete}>Delete</Button>
            </div>
          </div>
        </div>
      </form>

      {confirmDialog}
    </ContentReveal>
  );
}
