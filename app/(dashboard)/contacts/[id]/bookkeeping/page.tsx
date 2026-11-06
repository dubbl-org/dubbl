"use client";

import { useParams } from "next/navigation";
import { toast } from "sonner";
import { Section } from "@/components/dashboard/section";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ContentReveal } from "@/components/ui/content-reveal";
import { decimalToCents } from "@/lib/money";
import { useApi } from "@/lib/query/use-api";
import { useContactContext, getOrgId } from "../layout";
import type { Account, TaxRate, ContactDetail } from "../layout";

export default function ContactBookkeepingPage() {
  const { id } = useParams<{ id: string }>();
  const {
    contact,
    setContact,
    formType,
    formRevenueAccountId,
    setFormRevenueAccountId,
    formExpenseAccountId,
    setFormExpenseAccountId,
    formTaxRateId,
    setFormTaxRateId,
    formTaxExempt,
    formCreditLimit,
    formCurrencyCode,
    saving,
    setSaving,
  } = useContactContext();

  const { data: accountsData } = useApi<{ accounts?: Account[] }>("/api/v1/accounts");
  const { data: taxRatesData } = useApi<{ taxRates?: TaxRate[] }>("/api/v1/tax-rates");
  const accounts = accountsData?.accounts ?? [];
  const taxRates = taxRatesData?.taxRates ?? [];

  const revenueAccounts = accounts.filter((a) => a.type === "revenue");
  const expenseAccounts = accounts.filter((a) => a.type === "expense");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const orgId = getOrgId();
    if (!orgId) return;

    try {
      const res = await fetch(`/api/v1/contacts/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-organization-id": orgId,
        },
        body: JSON.stringify({
          name: contact.name,
          email: contact.email || null,
          phone: contact.phone || null,
          taxNumber: contact.taxNumber || null,
          type: formType,
          paymentTermsDays: contact.paymentTermsDays,
          creditLimit: formCreditLimit
            ? decimalToCents(formCreditLimit)
            : null,
          isTaxExempt: formTaxExempt,
          currencyCode: formCurrencyCode || null,
          defaultRevenueAccountId: formRevenueAccountId !== "none" ? formRevenueAccountId : null,
          defaultExpenseAccountId: formExpenseAccountId !== "none" ? formExpenseAccountId : null,
          defaultTaxRateId: formTaxRateId !== "none" ? formTaxRateId : null,
          notes: contact.notes || null,
        }),
      });

      if (!res.ok) throw new Error("Failed to update");
      const data = await res.json();
      const c = data.contact as ContactDetail;
      setContact(c);
      toast.success("Contact updated");
    } catch {
      toast.error("Failed to update contact");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ContentReveal key="bookkeeping">
      <form onSubmit={handleSubmit} className="space-y-10">
        <Section title="Default accounts" description="Where money from this contact lands in your books by default.">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Income account (money they pay you)</Label>
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
              <Label className="text-xs">Spending account (money you pay them)</Label>
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

        <div className="flex justify-end">
          <Button
            type="submit"
            loading={saving}
            size="sm"
            className="bg-brand-600 hover:bg-brand-700"
          >
            Save changes
          </Button>
        </div>
      </form>
    </ContentReveal>
  );
}
