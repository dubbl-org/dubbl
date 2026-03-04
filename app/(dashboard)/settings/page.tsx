"use client";

import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { Check, ChevronsUpDown } from "lucide-react";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { COUNTRIES as ALL_COUNTRIES } from "@/lib/countries";
import { PAYMENT_TERMS } from "@/lib/payment-terms";
import {
  COUNTRIES as BUSINESS_COUNTRIES,
  getBusinessTypesForCountry,
  getCountryByCode,
} from "@/lib/data/business-types";

interface OrgSettings {
  id: string;
  name: string;
  country: string | null;
  businessType: string | null;
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

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-6 sm:grid-cols-[200px_1fr] sm:gap-10">
      <div className="shrink-0">
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">{description}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

export default function SettingsPage() {
  const [, setOrg] = useState<OrgSettings | null>(null);
  const [form, setForm] = useState({
    name: "",
    country: "" as string,
    businessType: "" as string,
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
  const [countryOpen, setCountryOpen] = useState(false);

  const businessTypes = useMemo(
    () => (form.country ? getBusinessTypesForCountry(form.country) : []),
    [form.country]
  );

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
            country: o.country ?? "",
            businessType: o.businessType ?? "",
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

  function handleCountryChange(countryCode: string) {
    const country = getCountryByCode(countryCode);
    setForm((prev) => ({
      ...prev,
      country: countryCode,
      businessType: "",
      countryCode: countryCode,
      ...(country ? { defaultCurrency: country.defaultCurrency } : {}),
    }));
    setCountryOpen(false);
  }

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
          country: form.country || null,
          businessType: form.businessType || null,
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

  const selectedCountry = form.country
    ? getCountryByCode(form.country)
    : null;

  return (
    <div className="space-y-10">
      {/* Organization */}
      <Section title="Organization" description="Basic details about your organization.">
        <div className="space-y-1.5">
          <Label className="text-xs">Name</Label>
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Acme Inc."
          />
        </div>
      </Section>

      <div className="h-px bg-border" />

      {/* Legal */}
      <Section title="Legal" description="Legal entity information, tax IDs, and registration details.">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Country</Label>
            <Popover open={countryOpen} onOpenChange={setCountryOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  role="combobox"
                  aria-expanded={countryOpen}
                  className={cn(
                    "flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors",
                    "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                    !selectedCountry && "text-muted-foreground"
                  )}
                >
                  {selectedCountry
                    ? `${selectedCountry.flag} ${selectedCountry.name}`
                    : "Select country..."}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search country..." />
                  <CommandList>
                    <CommandEmpty>No country found.</CommandEmpty>
                    <CommandGroup>
                      {BUSINESS_COUNTRIES.map((country) => (
                        <CommandItem
                          key={country.code}
                          value={`${country.name} ${country.code}`}
                          onSelect={() => handleCountryChange(country.code)}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              form.country === country.code
                                ? "opacity-100"
                                : "opacity-0"
                            )}
                          />
                          {country.flag} {country.name}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Entity type</Label>
            {form.country ? (
              <Select
                value={form.businessType}
                onValueChange={(v) => setForm({ ...form, businessType: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select type..." />
                </SelectTrigger>
                <SelectContent>
                  {businessTypes.map((bt) => (
                    <SelectItem key={bt.code} value={bt.code}>
                      <span>{bt.localName}</span>
                      {bt.localName !== bt.englishName && (
                        <span className="ml-1 text-muted-foreground">
                          ({bt.englishName})
                        </span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="flex h-9 items-center rounded-md border border-input px-3 text-xs text-muted-foreground">
                Select a country first
              </div>
            )}
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
              placeholder="e.g. 12345678"
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
      </Section>

      <div className="h-px bg-border" />

      {/* Address */}
      <Section title="Address" description="Your organization's registered address.">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Street</Label>
            <Input
              value={form.addressStreet}
              onChange={(e) =>
                setForm({ ...form, addressStreet: e.target.value })
              }
              placeholder="123 Main Street"
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
                placeholder="San Francisco"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">State / Province</Label>
              <Input
                value={form.addressState}
                onChange={(e) =>
                  setForm({ ...form, addressState: e.target.value })
                }
                placeholder="California"
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
                placeholder="94105"
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
                  {ALL_COUNTRIES.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </Section>

      <div className="h-px bg-border" />

      {/* Contact */}
      <Section title="Contact" description="How customers and partners can reach your organization.">
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
      </Section>

      <div className="h-px bg-border" />

      {/* Financials */}
      <Section title="Financials" description="Currency, fiscal year, and default payment terms.">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Default currency</Label>
            <Input
              value={form.defaultCurrency}
              onChange={(e) =>
                setForm({ ...form, defaultCurrency: e.target.value })
              }
              placeholder="USD"
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
      </Section>

      <div className="h-px bg-border" />

      {/* Save */}
      <div className="flex justify-end">
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
      <Section title="Danger zone" description="Irreversible actions for this organization.">
        <div className="flex items-center justify-between rounded-md border border-red-200 bg-red-50 px-4 py-3 dark:border-red-900/50 dark:bg-red-950/20">
          <div>
            <p className="text-sm font-medium text-red-600 dark:text-red-400">Delete organization</p>
            <p className="text-[12px] text-muted-foreground">
              Permanently delete this organization and all its data.
            </p>
          </div>
          <Button variant="destructive" size="sm">
            Delete
          </Button>
        </div>
      </Section>
    </div>
  );
}
