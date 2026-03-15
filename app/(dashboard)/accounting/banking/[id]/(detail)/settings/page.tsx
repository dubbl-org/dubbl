"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CurrencySelect } from "@/components/ui/currency-select";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useConfirm } from "@/lib/hooks/use-confirm";
import { cn } from "@/lib/utils";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";
import { useBankAccountContext } from "../layout";
import { ACCOUNT_TYPE_LABELS, ACCOUNT_COLORS } from "../../_components";

export default function BankSettingsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const { account, setAccount, refetch } = useBankAccountContext();
  const [saving, setSaving] = useState(false);
  const [bankCurrency, setBankCurrency] = useState(account?.currencyCode || "USD");

  const orgId = typeof window !== "undefined" ? localStorage.getItem("activeOrgId") : null;

  useDocumentTitle("Accounting \u00B7 Bank Settings");

  async function handleSaveSettings(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!orgId) return;
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch(`/api/v1/bank-accounts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify({
          accountName: fd.get("accountName"),
          bankName: fd.get("bankName") || null,
          accountNumber: fd.get("accountNumber") || null,
          currencyCode: bankCurrency || undefined,
          countryCode: fd.get("countryCode") || null,
          accountType: fd.get("accountType") || undefined,
          color: fd.get("color") || undefined,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      const data = await res.json();
      setAccount(() => data.bankAccount);
      toast.success("Account updated");
      refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update account");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!orgId) return;
    await confirm({
      title: "Delete this bank account?",
      description: "This will permanently delete the account and all its transactions. This cannot be undone.",
      confirmLabel: "Delete Account",
      destructive: true,
      onConfirm: async () => {
        const res = await fetch(`/api/v1/bank-accounts/${id}`, {
          method: "DELETE",
          headers: { "x-organization-id": orgId },
        });
        if (res.ok) {
          toast.success("Account deleted");
          router.push("/accounting/banking");
        } else {
          toast.error("Failed to delete account");
        }
      },
    });
  }

  return (
    <>
      <form onSubmit={handleSaveSettings} className="space-y-10">
        <div className="grid gap-6 sm:grid-cols-[200px_1fr] sm:gap-10">
          <div className="shrink-0">
            <p className="text-sm font-medium">General</p>
            <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">Account name, bank, and type.</p>
          </div>
          <div className="min-w-0 space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Account Name</Label>
              <Input name="accountName" required defaultValue={account.accountName} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Bank Name</Label>
                <Input name="bankName" defaultValue={account.bankName || ""} placeholder="e.g. Revolut Business" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Account Type</Label>
                <Select name="accountType" defaultValue={account.accountType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(ACCOUNT_TYPE_LABELS).map(([v, l]) => (
                      <SelectItem key={v} value={v}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Account Number / IBAN</Label>
              <Input name="accountNumber" defaultValue={account.accountNumber || ""} placeholder="1234 or GB29NWBK..." />
            </div>
          </div>
        </div>

        <div className="h-px bg-border" />

        <div className="grid gap-6 sm:grid-cols-[200px_1fr] sm:gap-10">
          <div className="shrink-0">
            <p className="text-sm font-medium">Region</p>
            <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">Currency and country for this account.</p>
          </div>
          <div className="min-w-0 grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Currency</Label>
              <CurrencySelect value={bankCurrency} onValueChange={setBankCurrency} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Country</Label>
              <Input name="countryCode" defaultValue={account.countryCode || ""} placeholder="US" maxLength={2} />
            </div>
          </div>
        </div>

        <div className="h-px bg-border" />

        <div className="grid gap-6 sm:grid-cols-[200px_1fr] sm:gap-10">
          <div className="shrink-0">
            <p className="text-sm font-medium">Accent Color</p>
            <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">Color used on cards and charts.</p>
          </div>
          <div className="min-w-0">
            <input type="hidden" name="color" value={account.color} />
            <div className="flex gap-2">
              {ACCOUNT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setAccount((prev) => prev ? { ...prev, color: c } : prev)}
                  className={cn(
                    "size-6 rounded-full ring-2 ring-transparent transition-all",
                    account.color === c && "ring-offset-2 ring-gray-400"
                  )}
                  style={{ backgroundColor: c }}
                  aria-label={`Choose ${c}`}
                />
              ))}
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

        <div className="grid gap-6 sm:grid-cols-[200px_1fr] sm:gap-10">
          <div className="shrink-0">
            <p className="text-sm font-medium text-red-600">Danger zone</p>
            <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">Irreversible actions.</p>
          </div>
          <div className="min-w-0">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-md border border-red-200 bg-red-50 px-4 py-3 dark:border-red-900/50 dark:bg-red-950/20">
              <div>
                <p className="text-sm font-medium text-red-600 dark:text-red-400">Delete account</p>
                <p className="text-[12px] text-muted-foreground">Permanently delete this account and all imported transactions.</p>
              </div>
              <Button variant="destructive" size="sm" type="button" onClick={handleDelete}>Delete</Button>
            </div>
          </div>
        </div>
      </form>

      {confirmDialog}
    </>
  );
}
