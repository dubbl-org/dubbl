"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Section } from "@/components/dashboard/section";
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
import { Checkbox } from "@/components/ui/checkbox";
import { ContentReveal } from "@/components/ui/content-reveal";
import { decimalToCents } from "@/lib/money";
import { CurrencyInput } from "@/components/ui/currency-input";
import { CurrencySelect } from "@/components/ui/currency-select";
import { useContactContext, getOrgId } from "./layout";
import type { Account, TaxRate, ContactDetail } from "./layout";

export default function ContactDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const {
    contact,
    setContact,
    confirm,
    formType,
    setFormType,
    formTaxExempt,
    setFormTaxExempt,
    formCreditLimit,
    setFormCreditLimit,
    formCurrencyCode,
    setFormCurrencyCode,
    formRevenueAccountId,
    setFormRevenueAccountId,
    formExpenseAccountId,
    setFormExpenseAccountId,
    formTaxRateId,
    setFormTaxRateId,
    saving,
    setSaving,
  } = useContactContext();

  const [deleting] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [taxRates, setTaxRates] = useState<TaxRate[]>([]);

  const fetchReferenceData = useCallback(() => {
    const orgId = getOrgId();
    if (!orgId) return;

    fetch("/api/v1/accounts", {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.accounts) setAccounts(data.accounts);
      })
      .catch(() => {});

    fetch("/api/v1/tax-rates", {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.taxRates) setTaxRates(data.taxRates);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchReferenceData();
  }, [fetchReferenceData]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const form = new FormData(e.currentTarget);
    const orgId = getOrgId();
    if (!orgId) return;

    const creditLimitValue = formCreditLimit;

    try {
      const res = await fetch(`/api/v1/contacts/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-organization-id": orgId,
        },
        body: JSON.stringify({
          name: form.get("name"),
          email: form.get("email") || null,
          phone: form.get("phone") || null,
          taxNumber: form.get("taxNumber") || null,
          type: formType,
          paymentTermsDays:
            parseInt(form.get("paymentTermsDays") as string) || 30,
          creditLimit: creditLimitValue
            ? decimalToCents(creditLimitValue)
            : null,
          isTaxExempt: formTaxExempt,
          currencyCode: formCurrencyCode || null,
          defaultRevenueAccountId: formRevenueAccountId !== "none" ? formRevenueAccountId : null,
          defaultExpenseAccountId: formExpenseAccountId !== "none" ? formExpenseAccountId : null,
          defaultTaxRateId: formTaxRateId !== "none" ? formTaxRateId : null,
          notes: form.get("notes") || null,
        }),
      });

      if (!res.ok) throw new Error("Failed to update");
      const data = await res.json();
      const c = data.contact as ContactDetail;
      setContact(c);
      setFormType(c.type);
      setFormRevenueAccountId(c.defaultRevenueAccountId || "none");
      setFormExpenseAccountId(c.defaultExpenseAccountId || "none");
      setFormTaxRateId(c.defaultTaxRateId || "none");
      setFormTaxExempt(c.isTaxExempt);
      setFormCreditLimit(c.creditLimit != null ? String(c.creditLimit / 100) : "");
      setFormCurrencyCode(c.currencyCode || "");
      toast.success("Contact updated");
    } catch {
      toast.error("Failed to update contact");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    await confirm({
      title: "Delete this contact?",
      description: "This contact and all associated data will be permanently deleted.",
      confirmLabel: "Delete",
      destructive: true,
      onConfirm: async () => {
        const orgId = getOrgId();
        if (!orgId) return;
        await fetch(`/api/v1/contacts/${id}`, {
          method: "DELETE",
          headers: { "x-organization-id": orgId },
        });
        toast.success("Contact deleted");
        router.push("/contacts");
      },
    });
  }

  const revenueAccounts = accounts.filter((a) => a.type === "revenue");
  const expenseAccounts = accounts.filter((a) => a.type === "expense");

  return (
    <ContentReveal key="details">
      <form onSubmit={handleSubmit} className="space-y-10">
        <Section title="General" description="Basic contact information and identification.">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Name</Label>
              <Input name="name" required defaultValue={contact.name} placeholder="Contact name" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Email</Label>
                <Input name="email" type="email" defaultValue={contact.email || ""} placeholder="email@example.com" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Phone</Label>
                <Input name="phone" defaultValue={contact.phone || ""} placeholder="+1 (555) 000-0000" />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Type</Label>
                <Select value={formType} onValueChange={setFormType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="customer">Customer</SelectItem>
                    <SelectItem value="supplier">Supplier</SelectItem>
                    <SelectItem value="both">Both</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Tax number / VAT</Label>
                <Input name="taxNumber" defaultValue={contact.taxNumber || ""} placeholder="e.g. US12-3456789" />
              </div>
            </div>
          </div>
        </Section>

        <div className="h-px bg-border" />

        <Section title="Payment" description="Payment terms, currency, and credit settings.">
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Payment terms (days)</Label>
                <Input
                  name="paymentTermsDays"
                  type="number"
                  min={0}
                  defaultValue={contact.paymentTermsDays}
                  placeholder="e.g. 30"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Currency code</Label>
                <CurrencySelect
                  value={formCurrencyCode}
                  onValueChange={setFormCurrencyCode}
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Credit limit</Label>
                <CurrencyInput
                  prefix="$"
                  value={formCreditLimit}
                  onChange={setFormCreditLimit}
                  placeholder="No limit"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Tax status</Label>
                <div className="flex h-9 items-center space-x-2">
                  <Checkbox
                    id="isTaxExempt"
                    checked={formTaxExempt}
                    onCheckedChange={(checked) =>
                      setFormTaxExempt(checked === true)
                    }
                  />
                  <Label
                    htmlFor="isTaxExempt"
                    className="cursor-pointer text-sm font-normal"
                  >
                    Tax exempt
                  </Label>
                </div>
              </div>
            </div>
          </div>
        </Section>

        <div className="h-px bg-border" />

        <Section title="Default accounts" description="Default chart of accounts for this contact's transactions.">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Revenue account</Label>
              <Select
                value={formRevenueAccountId}
                onValueChange={setFormRevenueAccountId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select account" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {revenueAccounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.code} - {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Expense account</Label>
              <Select
                value={formExpenseAccountId}
                onValueChange={setFormExpenseAccountId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select account" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {expenseAccounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.code} - {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </Section>

        <div className="h-px bg-border" />

        <Section title="Default tax rate" description="Automatically applied when creating invoices or bills for this contact.">
          <div className="max-w-xs">
            <Select
              value={formTaxRateId}
              onValueChange={setFormTaxRateId}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select tax rate" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {taxRates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name} ({(t.rate / 100).toFixed(1)}%)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </Section>

        <div className="h-px bg-border" />

        <Section title="Notes" description="Internal notes about this contact.">
          <Textarea
            name="notes"
            defaultValue={contact.notes || ""}
            rows={3}
            placeholder="Internal notes..."
          />
        </Section>

        <div className="h-px bg-border" />

        <div className="flex justify-end">
          <Button
            type="submit"
            loading={saving}
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            Save changes
          </Button>
        </div>

        <div className="h-px bg-border" />

        {/* Danger zone */}
        <Section title="Danger zone" description="Irreversible actions for this contact.">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-md border border-red-200 bg-red-50 px-4 py-3 dark:border-red-900/50 dark:bg-red-950/20">
            <div>
              <p className="text-sm font-medium text-red-600 dark:text-red-400">Delete contact</p>
              <p className="text-[12px] text-muted-foreground">
                Permanently delete this contact and all associated data.
              </p>
            </div>
            <Button
              variant="destructive"
              size="sm"
              loading={deleting}
              onClick={handleDelete}
            >
              Delete
            </Button>
          </div>
        </Section>
      </form>
    </ContentReveal>
  );
}
