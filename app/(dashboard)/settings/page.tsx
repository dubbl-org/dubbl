"use client";

import { useState, useMemo } from "react";
import { toast } from "sonner";
import { Check, ChevronsUpDown, Lock } from "lucide-react";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";
import { useApi, useApiCache } from "@/lib/query/use-api";
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
import { CurrencySelect } from "@/components/ui/currency-select";
import { cn } from "@/lib/utils";
import { COUNTRIES as ALL_COUNTRIES } from "@/lib/countries";
import { PAYMENT_TERMS } from "@/lib/payment-terms";
import {
  COUNTRIES as BUSINESS_COUNTRIES,
  getBusinessTypesForCountry,
  getCountryByCode,
} from "@/lib/data/business-types";
import { Section } from "@/components/dashboard/section";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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
  peppolId?: string | null;
  peppolScheme?: string | null;
  interestRate?: number | null;
  interestMethod?: string | null;
  interestGraceDays?: number | null;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

type OrgForm = {
  name: string;
  country: string;
  businessType: string;
  defaultCurrency: string;
  fiscalYearStartMonth: string;
  countryCode: string;
  taxId: string;
  businessRegistrationNumber: string;
  legalEntityType: string;
  addressStreet: string;
  addressCity: string;
  addressState: string;
  addressPostalCode: string;
  addressCountry: string;
  contactPhone: string;
  contactEmail: string;
  contactWebsite: string;
  defaultPaymentTerms: string;
  industrySector: string;
  interestPercent: string;
  interestMethod: string;
  interestGraceDays: string;
};

function toForm(o: OrgSettings | null | undefined): OrgForm {
  if (!o) {
    return {
      name: "",
      country: "",
      businessType: "",
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
      interestPercent: "",
      interestMethod: "simple",
      interestGraceDays: "0",
    };
  }
  return {
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
    // Stored in basis points (850 = 8.5%); edited as a percentage.
    interestPercent: o.interestRate != null ? String(o.interestRate / 100) : "",
    interestMethod: o.interestMethod || "simple",
    interestGraceDays: String(o.interestGraceDays ?? 0),
  };
}

export default function SettingsPage() {
  const { data: orgData } = useApi<{ organization?: OrgSettings }>("/api/v1/organization");
  const { data: lockData } = useApi<{ periodLock?: { lockDate?: string | null; advisorLockDate?: string | null } | null }>("/api/v1/period-lock");
  const cache = useApiCache();
  const org = orgData?.organization ?? null;
  const [draft, setDraft] = useState<OrgForm | null>(null);
  const form = draft ?? toForm(org);
  const setForm = (next: OrgForm | ((prev: OrgForm) => OrgForm)) =>
    setDraft((prev) => (typeof next === "function" ? next(prev ?? form) : next));
  const [saving, setSaving] = useState(false);
  const [countryOpen, setCountryOpen] = useState(false);
  const [lockDraft, setLockDate] = useState<string | null>(null);
  const lockDate = lockDraft ?? lockData?.periodLock?.lockDate ?? "";
  const [advisorLockDraft, setAdvisorLockDate] = useState<string | null>(null);
  const advisorLockDate = advisorLockDraft ?? lockData?.periodLock?.advisorLockDate ?? "";
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [lockSaving, setLockSaving] = useState(false);
  const [peppolIdDraft, setPeppolId] = useState<string | null>(null);
  const [peppolSchemeDraft, setPeppolScheme] = useState<string | null>(null);
  const peppolId = peppolIdDraft ?? org?.peppolId ?? "";
  const peppolScheme = peppolSchemeDraft ?? org?.peppolScheme ?? "";

  useDocumentTitle("Settings · General");

  const businessTypes = useMemo(
    () => (form.countryCode ? getBusinessTypesForCountry(form.countryCode) : []),
    [form.countryCode]
  );

  function handleCountryChange(countryCode: string) {
    const country = getCountryByCode(countryCode);
    setForm((prev) => ({
      ...prev,
      country: country?.name ?? countryCode,
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
          peppolId: peppolId || null,
          peppolScheme: peppolScheme || null,
          interestRate: form.interestPercent.trim()
            ? Math.round(parseFloat(form.interestPercent) * 100)
            : null,
          interestMethod: form.interestMethod,
          interestGraceDays: parseInt(form.interestGraceDays) || 0,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      if (json.organization) cache.set("/api/v1/organization", { organization: json.organization });
      setDraft(null);
      setPeppolId(null);
      setPeppolScheme(null);
      toast.success("Settings saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function deleteOrganization() {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;
    setDeleting(true);
    try {
      const res = await fetch("/api/v1/organization", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify({ confirmName: deleteConfirm }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Failed to delete organization");
      // Open whichever organization is left, or onboarding when there's none.
      localStorage.removeItem("activeOrgId");
      window.location.href = "/dashboard";
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete organization");
      setDeleting(false);
    }
  }

  const selectedCountry = form.countryCode
    ? getCountryByCode(form.countryCode)
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
            <Label className="text-xs">Country (sets your tax rules)</Label>
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
                              form.countryCode === country.code
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
            <p className="text-[11px] text-muted-foreground">
              Picks the right tax rules and forms for where your business is based (for example VAT, GST or sales tax).
            </p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Business structure</Label>
            {form.countryCode ? (
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
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Default currency</Label>
            <CurrencySelect
              value={form.defaultCurrency}
              onValueChange={(v) =>
                setForm({ ...form, defaultCurrency: v })
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
      </Section>

      <div className="h-px bg-border" />

      {/* Late payment interest */}
      <Section title="Late payment interest" description="What Charge interest on an overdue invoice bills the customer for paying late. Leave the rate blank if you don't charge interest.">
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Annual interest rate (%)</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={form.interestPercent}
              onChange={(e) =>
                setForm({ ...form, interestPercent: e.target.value })
              }
              placeholder="e.g. 8"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Interest method</Label>
            <Select
              value={form.interestMethod}
              onValueChange={(v) => setForm({ ...form, interestMethod: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="simple">Simple</SelectItem>
                <SelectItem value="compound">Compound (daily)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Grace period (days)</Label>
            <Input
              type="number"
              min="0"
              step="1"
              value={form.interestGraceDays}
              onChange={(e) =>
                setForm({ ...form, interestGraceDays: e.target.value })
              }
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Interest runs on the amount still due, from the end of the grace period after the due date.
        </p>
      </Section>

      <div className="h-px bg-border" />

      {/* E-Invoicing / PEPPOL */}
      <Section title="Send invoices electronically" description="Your business ID on the PEPPOL network, which lets you send invoices straight into another company's system (required in parts of the EU, UK and Singapore). Leave blank if you don't use it.">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">PEPPOL Participant ID</Label>
            <Input
              value={peppolId}
              onChange={(e) => setPeppolId(e.target.value)}
              placeholder="e.g. 0088:1234567890"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">PEPPOL Scheme</Label>
            <Select
              value={peppolScheme}
              onValueChange={setPeppolScheme}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select scheme" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0088">0088 - EAN/GLN</SelectItem>
                <SelectItem value="0007">0007 - SE Org Nr</SelectItem>
                <SelectItem value="0009">0009 - FR SIRET</SelectItem>
                <SelectItem value="9925">9925 - IT VAT</SelectItem>
                <SelectItem value="9930">9930 - DE VAT</SelectItem>
                <SelectItem value="9944">9944 - GB VAT</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Once configured, you can download UBL XML invoices from each invoice detail page.
        </p>
      </Section>

      <div className="h-px bg-border" />

      {/* Save */}
      <div className="flex justify-end">
        <Button
          onClick={save}
          disabled={saving}
          size="sm"
          className="bg-brand-600 hover:bg-brand-700"
        >
          {saving ? "Saving..." : "Save changes"}
        </Button>
      </div>

      <div className="h-px bg-border" />

      {/* Period Lock */}
      <Section title="Lock past dates" description="Lock past dates so they can't be changed. Once set, nothing dated on or before this day can be added or edited. Useful after you've filed taxes or closed your books for a period.">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5 flex-1 max-w-xs">
            <Label className="text-xs">Lock everything up to and including</Label>
            <Input
              type="date"
              value={lockDate}
              onChange={(e) => setLockDate(e.target.value)}
            />
          </div>
          <div className="space-y-1.5 flex-1 max-w-xs">
            <Label className="text-xs">Advisor lock date (optional)</Label>
            <Input
              type="date"
              value={advisorLockDate}
              onChange={(e) => setAdvisorLockDate(e.target.value)}
            />
          </div>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            disabled={lockSaving}
            onClick={async () => {
              const orgId = localStorage.getItem("activeOrgId");
              if (!orgId || !lockDate) return;
              setLockSaving(true);
              try {
                const res = await fetch("/api/v1/period-lock", {
                  method: "PUT",
                  headers: { "Content-Type": "application/json", "x-organization-id": orgId },
                  body: JSON.stringify({ lockDate, advisorLockDate: advisorLockDate || null }),
                });
                if (!res.ok) {
                  const data = await res.json();
                  toast.error(data.error || "Failed to set lock");
                  return;
                }
                // The saved date is in the refreshed cache now.
                setLockDate(null);
                setAdvisorLockDate(null);
                toast.success("Period locked");
              } finally {
                setLockSaving(false);
              }
            }}
          >
            <Lock className="size-3.5" />
            {lockSaving ? "Saving..." : "Lock dates"}
          </Button>
        </div>
        {lockDate && (
          <p className="text-xs text-amber-600 mt-2">
            Nothing dated on or before {lockDate} can be added or changed.
            {advisorLockDate && advisorLockDate < lockDate
              ? ` Your advisors can still work back to the day after ${advisorLockDate}.`
              : ""}
          </p>
        )}
        <p className="text-xs text-muted-foreground mt-2">
          The advisor lock date is an earlier hard lock for your advisors (Settings &gt; Advisors): they can still change things dated after it, while your team is held to the main lock date. Leave it blank to hold everyone to the same date.
        </p>
      </Section>

      <div className="h-px bg-border" />

      {/* Danger zone */}
      <Section title="Danger zone" description="Irreversible actions for this organization.">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-md border border-red-200 bg-red-50 px-4 py-3 dark:border-red-900/50 dark:bg-red-950/20">
          <div>
            <p className="text-sm font-medium text-red-600 dark:text-red-400">Delete organization</p>
            <p className="text-[12px] text-muted-foreground">
              Permanently delete this organization and all its data.
            </p>
          </div>
          <Button
            variant="destructive"
            size="sm"
            className="w-fit"
            onClick={() => {
              setDeleteConfirm("");
              setDeleteOpen(true);
            }}
          >
            Delete
          </Button>
        </div>
      </Section>

      <Dialog open={deleteOpen} onOpenChange={(o) => !deleting && setDeleteOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {org?.name ?? "this organization"}?</DialogTitle>
            <DialogDescription>
              This permanently deletes the organization with all its books, contacts, documents and backups, cancels its subscription and removes everyone&apos;s access. It can&apos;t be undone. Download a backup first if you might need the data.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label className="text-xs">Type the organization&apos;s name to confirm</Label>
            <Input
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              placeholder={org?.name}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleting || !org || deleteConfirm.trim() !== org.name.trim()}
              onClick={deleteOrganization}
            >
              {deleting ? "Deleting..." : "Delete organization"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
