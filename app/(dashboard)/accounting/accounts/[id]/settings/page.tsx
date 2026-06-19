"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Lock } from "lucide-react";
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
import { useConfirm } from "@/lib/hooks/use-confirm";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";
import { useAccountContext } from "../layout";

export default function AccountSettingsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const { account, setAccount, refetch } = useAccountContext();
  const [saving, setSaving] = useState(false);

  const orgId = typeof window !== "undefined" ? localStorage.getItem("activeOrgId") : null;

  useDocumentTitle("Accounting \u00B7 Account Settings");

  if (!account) return null;

  const cur = account.currencyCode || "USD";
  const isSystem = account.isSystem === true;

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!orgId) return;
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    // Built-in categories have their name/code locked (the inputs are disabled,
    // so they aren't in the form data) — only send the editable usage fields.
    const payload = isSystem
      ? {
          subType: fd.get("subType") || null,
          description: fd.get("description") || null,
          isActive: fd.get("isActive") === "true",
        }
      : {
          code: fd.get("code"),
          name: fd.get("name"),
          subType: fd.get("subType") || null,
          description: fd.get("description") || null,
          isActive: fd.get("isActive") === "true",
        };
    try {
      const res = await fetch(`/api/v1/accounts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      const data = await res.json();
      setAccount(() => data.account ? { ...account, ...data.account } : account);
      toast.success("Account updated");
      window.dispatchEvent(new CustomEvent("accounts-changed"));
      refetch();
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
          toast.success(willDeactivate ? "Account deactivated" : "Account reactivated");
          window.dispatchEvent(new CustomEvent("accounts-changed"));
          refetch();
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
          toast.error(typeof data.error === "string" ? data.error : "Failed to delete account");
        }
      },
    });
  }

  return (
    <>
      <form onSubmit={handleSave} className="space-y-10">
        {isSystem && (
          <div className="flex items-start gap-2.5 rounded-md border border-border bg-muted/40 px-4 py-3">
            <Lock className="size-4 mt-0.5 shrink-0 text-muted-foreground" />
            <p className="text-[12px] leading-relaxed text-muted-foreground">
              This is a <span className="font-medium text-foreground">built-in category</span>. It&apos;s kept up to date for you,
              so its name and code can&apos;t be changed and it can&apos;t be deleted. You can still hide it (mark it inactive) or
              set its tax defaults. Need something different? <span className="font-medium text-foreground">Create your own category</span> instead.
            </p>
          </div>
        )}

        {/* General */}
        <div className="grid gap-6 sm:grid-cols-[200px_1fr] sm:gap-10">
          <div className="shrink-0">
            <p className="text-sm font-medium">General</p>
            <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
              {isSystem ? "Description for this built-in category. Name and code are fixed." : "Account name, code, and description."}
            </p>
          </div>
          <div className="min-w-0 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Account Code</Label>
                <Input name="code" required defaultValue={account.code} className="font-mono" readOnly={isSystem} disabled={isSystem} />
                <p className="text-[11px] text-muted-foreground">
                  {isSystem ? "Built-in category codes are fixed." : "Changing the code won’t affect existing journal entries."}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Account Name</Label>
                <Input name="name" required defaultValue={account.name} readOnly={isSystem} disabled={isSystem} />
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
            <Select name="isActive" defaultValue={account.isActive === false ? "false" : "true"} key={String(account.isActive)}>
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

            {isSystem ? (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-md border px-4 py-3">
                <div>
                  <p className="text-sm font-medium">Delete account</p>
                  <p className="text-[12px] text-muted-foreground">Built-in categories can&apos;t be deleted. Mark it inactive above to hide it.</p>
                </div>
                <Button variant="outline" size="sm" type="button" disabled>Delete</Button>
              </div>
            ) : (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-md border border-red-200 bg-red-50 px-4 py-3 dark:border-red-900/50 dark:bg-red-950/20">
                <div>
                  <p className="text-sm font-medium text-red-600 dark:text-red-400">Delete account</p>
                  <p className="text-[12px] text-muted-foreground">Accounts with existing transactions cannot be deleted.</p>
                </div>
                <Button variant="destructive" size="sm" type="button" onClick={handleDelete}>Delete</Button>
              </div>
            )}
          </div>
        </div>
      </form>

      {confirmDialog}
    </>
  );
}
