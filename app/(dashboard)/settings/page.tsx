"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { COUNTRIES } from "@/lib/countries";
import { LEGAL_ENTITY_TYPES } from "@/lib/legal-entity-types";
import { PAYMENT_TERMS } from "@/lib/payment-terms";

interface OrgSettings {
  id: string;
  name: string;
  slug: string;
  defaultCurrency: string;
  fiscalYearStartMonth: number;
  countryCode: string | null;
  taxId: string | null;
  businessRegistrationNumber: string | null;
  legalEntityType: string | null;
  addressStreet: string | null;
  addressCity: string | null;
  addressState: string | null;
  addressPostalCode: string | null;
  addressCountry: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  contactWebsite: string | null;
  defaultPaymentTerms: string | null;
  industrySector: string | null;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default function SettingsPage() {
  const [, setOrg] = useState<OrgSettings | null>(null);
  const [form, setForm] = useState({
    name: "",
    slug: "",
    defaultCurrency: "USD",
    fiscalYearStartMonth: "1",
    countryCode: "",
    taxId: "",
    businessRegistrationNumber: "",
    legalEntityType: "",
    addressStreet: "",
    addressCity: "",
    addressState: "",
    addressPostalCode: "",
    addressCountry: "",
    contactPhone: "",
    contactEmail: "",
    contactWebsite: "",
    defaultPaymentTerms: "",
    industrySector: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    fetch("/api/v1/organization", {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.organization) {
          const o = data.organization;
          setOrg(o);
          setForm({
            name: o.name,
            slug: o.slug,
            defaultCurrency: o.defaultCurrency,
            fiscalYearStartMonth: String(o.fiscalYearStartMonth),
            countryCode: o.countryCode || "",
            taxId: o.taxId || "",
            businessRegistrationNumber: o.businessRegistrationNumber || "",
            legalEntityType: o.legalEntityType || "",
            addressStreet: o.addressStreet || "",
            addressCity: o.addressCity || "",
            addressState: o.addressState || "",
            addressPostalCode: o.addressPostalCode || "",
            addressCountry: o.addressCountry || "",
            contactPhone: o.contactPhone || "",
            contactEmail: o.contactEmail || "",
            contactWebsite: o.contactWebsite || "",
            defaultPaymentTerms: o.defaultPaymentTerms || "",
            industrySector: o.industrySector || "",
          });
        }
      });
  }, []);

  async function save() {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;
    setSaving(true);
    try {
      const res = await fetch("/api/v1/organization", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-organization-id": orgId,
        },
        body: JSON.stringify({
          name: form.name,
          slug: form.slug,
          defaultCurrency: form.defaultCurrency,
          fiscalYearStartMonth: parseInt(form.fiscalYearStartMonth),
          countryCode: form.countryCode || null,
          taxId: form.taxId || null,
          businessRegistrationNumber: form.businessRegistrationNumber || null,
          legalEntityType: form.legalEntityType || null,
          addressStreet: form.addressStreet || null,
          addressCity: form.addressCity || null,
          addressState: form.addressState || null,
          addressPostalCode: form.addressPostalCode || null,
          addressCountry: form.addressCountry || null,
          contactPhone: form.contactPhone || null,
          contactEmail: form.contactEmail || null,
          contactWebsite: form.contactWebsite || null,
          defaultPaymentTerms: form.defaultPaymentTerms || null,
          industrySector: form.industrySector || null,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success("Settings saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* Organization */}
      <section className="space-y-4">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Organization</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Name</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Slug</Label>
            <Input
              value={form.slug}
              onChange={(e) => setForm({ ...form, slug: e.target.value })}
            />
          </div>
        </div>
      </section>

      <div className="h-px bg-border" />

      {/* Legal */}
      <section className="space-y-4">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Legal</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Country</Label>
            <Select
              value={form.countryCode}
              onValueChange={(v) => setForm({ ...form, countryCode: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select country" />
              </SelectTrigger>
              <SelectContent>
                {COUNTRIES.map((c) => (
                  <SelectItem key={c.code} value={c.code}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Entity type</Label>
            <Select
              value={form.legalEntityType}
              onValueChange={(v) => setForm({ ...form, legalEntityType: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                {LEGAL_ENTITY_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Tax ID / VAT</Label>
            <Input
              value={form.taxId}
              onChange={(e) => setForm({ ...form, taxId: e.target.value })}
              placeholder="e.g. US12-3456789"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Registration number</Label>
            <Input
              value={form.businessRegistrationNumber}
              onChange={(e) =>
                setForm({ ...form, businessRegistrationNumber: e.target.value })
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Industry</Label>
            <Input
              value={form.industrySector}
              onChange={(e) =>
                setForm({ ...form, industrySector: e.target.value })
              }
              placeholder="e.g. Technology"
            />
          </div>
        </div>
      </section>

      <div className="h-px bg-border" />

      {/* Address */}
      <section className="space-y-4">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Address</p>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Street</Label>
            <Input
              value={form.addressStreet}
              onChange={(e) =>
                setForm({ ...form, addressStreet: e.target.value })
              }
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">City</Label>
              <Input
                value={form.addressCity}
                onChange={(e) =>
                  setForm({ ...form, addressCity: e.target.value })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">State / Province</Label>
              <Input
                value={form.addressState}
                onChange={(e) =>
                  setForm({ ...form, addressState: e.target.value })
                }
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Postal code</Label>
              <Input
                value={form.addressPostalCode}
                onChange={(e) =>
                  setForm({ ...form, addressPostalCode: e.target.value })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Country</Label>
              <Select
                value={form.addressCountry}
                onValueChange={(v) => setForm({ ...form, addressCountry: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select country" />
                </SelectTrigger>
                <SelectContent>
                  {COUNTRIES.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </section>

      <div className="h-px bg-border" />

      {/* Contact */}
      <section className="space-y-4">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Contact</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Phone</Label>
            <Input
              value={form.contactPhone}
              onChange={(e) =>
                setForm({ ...form, contactPhone: e.target.value })
              }
              placeholder="+1 (555) 123-4567"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Email</Label>
            <Input
              type="email"
              value={form.contactEmail}
              onChange={(e) =>
                setForm({ ...form, contactEmail: e.target.value })
              }
              placeholder="billing@company.com"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-xs">Website</Label>
            <Input
              value={form.contactWebsite}
              onChange={(e) =>
                setForm({ ...form, contactWebsite: e.target.value })
              }
              placeholder="https://company.com"
            />
          </div>
        </div>
      </section>

      <div className="h-px bg-border" />

      {/* Financials */}
      <section className="space-y-4">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Financials</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Default currency</Label>
            <Input
              value={form.defaultCurrency}
              onChange={(e) =>
                setForm({ ...form, defaultCurrency: e.target.value })
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Fiscal year start</Label>
            <Select
              value={form.fiscalYearStartMonth}
              onValueChange={(v) =>
                setForm({ ...form, fiscalYearStartMonth: v })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MONTHS.map((m, i) => (
                  <SelectItem key={i} value={String(i + 1)}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Payment terms</Label>
            <Select
              value={form.defaultPaymentTerms}
              onValueChange={(v) =>
                setForm({ ...form, defaultPaymentTerms: v })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select terms" />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_TERMS.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>

      <div className="flex items-center justify-between pt-2">
        <Button
          onClick={save}
          disabled={saving}
          size="sm"
          className="bg-emerald-600 hover:bg-emerald-700"
        >
          {saving ? "Saving..." : "Save changes"}
        </Button>
      </div>

      <div className="h-px bg-border" />

      {/* Danger zone */}
      <section className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-red-600 dark:text-red-400">Delete organization</p>
          <p className="text-xs text-muted-foreground">
            Permanently delete this organization and all its data.
          </p>
        </div>
        <Button variant="destructive" size="sm">
          Delete
        </Button>
      </section>
    </div>
  );
}
