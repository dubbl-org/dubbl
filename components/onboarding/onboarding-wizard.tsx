"use client";

import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ArrowRight,
  ArrowLeft,
  Check,
  Search,
  Building2,
  Globe,
  Briefcase,
  Factory,
  Megaphone,
  ClipboardCheck,
  ArrowUpRight,
  Info,
  Receipt,
} from "lucide-react";
import {
  COUNTRIES,
  getBusinessTypesForCountry,
} from "@/lib/data/business-types";
import { INDUSTRIES } from "@/lib/data/industries";
import { REFERRAL_SOURCES } from "@/lib/data/referral-sources";
import { BrandGrain } from "@/components/shared/brand-grain";
import { getCountrySetup, fiscalYearEndLabel, MONTH_NAMES } from "@/lib/country-setup";
import { chartTemplateForCountry, seededAccountsFor } from "@/lib/db/chart-templates";
import { takePlanIntentUrl } from "@/lib/plan-intent";

const STEPS = [
  { label: "Organization", icon: Building2 },
  { label: "Country", icon: Globe },
  { label: "Business Type", icon: Briefcase },
  { label: "Tax & Year", icon: Receipt },
  { label: "Industry", icon: Factory },
  { label: "Referral", icon: Megaphone },
  { label: "Review", icon: ClipboardCheck },
];

interface OrgData {
  id: string;
  name: string;
  country: string | null;
  countryCode: string | null;
  businessType: string | null;
  industrySector: string | null;
}

export function OnboardingWizard() {
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [orgId, setOrgId] = useState("");
  const [orgName, setOrgName] = useState("");
  const [countryCode, setCountryCode] = useState("");
  const [businessType, setBusinessType] = useState("");
  const [industry, setIndustry] = useState("");
  const [referralSource, setReferralSource] = useState("");
  const [referralOther, setReferralOther] = useState("");
  // Tax & financial year — defaulted from the country, Xero-style.
  const [registered, setRegistered] = useState(true);
  const [taxId, setTaxId] = useState("");
  const [vatScheme, setVatScheme] = useState<"accrual" | "cash">("accrual");
  const [fiscalStart, setFiscalStart] = useState(1);

  // Escape hatch: user has other completed orgs
  const [hasOtherOrgs, setHasOtherOrgs] = useState(false);
  const [otherOrgId, setOtherOrgId] = useState("");

  // Load existing org data + check for other completed orgs
  useEffect(() => {
    const activeOrgId = localStorage.getItem("activeOrgId");

    // Fetch all orgs (no org header) to check for completed orgs
    const fetchAllOrgs = fetch("/api/v1/organization")
      .then((r) => r.json())
      .then((data) => {
        const orgs = data.organizations as Array<OrgData & { role: string }> | undefined;
        if (orgs) {
          const completedOrg = orgs.find((o) => o.country !== null);
          if (completedOrg) {
            setHasOtherOrgs(true);
            setOtherOrgId(completedOrg.id);
          }
        }
      })
      .catch(() => {});

    // Fetch active org data if set
    const fetchActiveOrg = activeOrgId
      ? fetch("/api/v1/organization", {
          headers: { "x-organization-id": activeOrgId },
        })
          .then((r) => r.json())
          .then((data) => {
            const org = data.organization as OrgData | undefined;
            if (org) {
              setOrgId(org.id);
              setOrgName(org.name);
              if (org.countryCode) setCountryCode(org.countryCode);
              if (org.businessType) setBusinessType(org.businessType);
              if (org.industrySector) setIndustry(org.industrySector);
            }
          })
          .catch(() => {})
      : Promise.resolve();

    Promise.all([fetchAllOrgs, fetchActiveOrg]).finally(() => setLoading(false));
  }, []);

  function generateSlug(name: string) {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  }

  function handleNameChange(value: string) {
    setOrgName(value);
  }

  function goNext() {
    setDirection(1);
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function goBack() {
    setDirection(-1);
    setStep((s) => Math.max(s - 1, 0));
  }

  function canProceed(): boolean {
    switch (step) {
      case 0:
        return orgName.trim().length > 0;
      case 1:
        return countryCode.length > 0;
      case 2:
        return businessType.length > 0;
      case 3: // defaults are always valid
      case 4: // optional
      case 5: // optional
        return true;
      default:
        return true;
    }
  }

  function isOptionalStep(): boolean {
    return step === 4 || step === 5;
  }

  async function handleComplete() {
    setSubmitting(true);
    try {
      let currentOrgId = orgId;

      // If no org exists yet, create one first
      if (!currentOrgId) {
        const createRes = await fetch("/api/v1/organization", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: orgName, slug: generateSlug(orgName) }),
        });

        if (!createRes.ok) {
          const data = await createRes.json();
          throw new Error(data.error || "Failed to create organization");
        }

        const createData = await createRes.json();
        currentOrgId = createData.organization.id;
        localStorage.setItem("activeOrgId", currentOrgId);
      }

      const selectedCountry = COUNTRIES.find((c) => c.code === countryCode);
      const setup = getCountrySetup(countryCode);
      const finalReferral =
        referralSource === "other" && referralOther.trim()
          ? `other: ${referralOther.trim()}`
          : referralSource;

      const patchHeaders: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (currentOrgId) {
        patchHeaders["x-organization-id"] = currentOrgId;
      }

      const res = await fetch("/api/v1/organization", {
        method: "PATCH",
        headers: patchHeaders,
        body: JSON.stringify({
          name: orgName,
          country: selectedCountry?.name ?? null,
          countryCode: countryCode || null,
          defaultCurrency: selectedCountry?.defaultCurrency ?? "USD",
          businessType: businessType || null,
          industrySector: industry || null,
          referralSource: finalReferral || null,
          fiscalYearStartMonth: fiscalStart,
          ...(setup.regime
            ? {
                registeredForTax: registered,
                ...(registered && taxId.trim() ? { taxId: taxId.trim() } : {}),
                ...(registered && setup.cashScheme ? { vatScheme } : {}),
              }
            : {}),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update organization");
      }

      window.location.href = takePlanIntentUrl() ?? "/dashboard";
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="w-full max-w-lg">
      {hasOtherOrgs && (
        <button
          onClick={() => {
            localStorage.setItem("activeOrgId", otherOrgId);
            window.location.href = "/dashboard";
          }}
          className="mb-4 flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowUpRight className="size-3.5" />
          Back to Dashboard
        </button>
      )}
      {/* Step content */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-2xl shadow-black/5 dark:shadow-black/40">
        {/* Grain gradient banner */}
        <div className="relative overflow-hidden">
          <BrandGrain tone="charcoal" />
          <div className="relative flex items-center justify-center gap-3 py-5">
            <div className="flex items-center gap-2">
              {STEPS.map((s, i) => {
                const Icon = s.icon;
                return (
                  <div
                    key={i}
                    className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-medium transition-all duration-300 ${
                      i === step
                        ? "border border-white/25 bg-white/20 text-white backdrop-blur-sm"
                        : i < step
                          ? "text-white/70"
                          : "text-white/30"
                    }`}
                  >
                    <Icon className="size-3" />
                    {i === step && (
                      <span>{s.label}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="px-6 py-8 sm:px-10 sm:py-10">
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={step}
              custom={direction}
              initial={{ opacity: 0, x: direction * 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: direction * -40 }}
              transition={{ duration: 0.25, ease: "easeInOut" }}
            >
              {step === 0 && (
                <StepOrgName
                  name={orgName}
                  onNameChange={handleNameChange}
                />
              )}
              {step === 1 && (
                <StepCountry
                  selected={countryCode}
                  onSelect={(code) => {
                    setCountryCode(code);
                    setBusinessType("");
                    const defaults = getCountrySetup(code);
                    setRegistered(true);
                    setTaxId("");
                    setVatScheme("accrual");
                    setFiscalStart(defaults.fiscalYearStartMonth);
                  }}
                />
              )}
              {step === 2 && (
                <StepBusinessType
                  countryCode={countryCode}
                  selected={businessType}
                  onSelect={setBusinessType}
                />
              )}
              {step === 3 && (
                <StepTax
                  countryCode={countryCode}
                  registered={registered}
                  onRegisteredChange={setRegistered}
                  taxId={taxId}
                  onTaxIdChange={setTaxId}
                  vatScheme={vatScheme}
                  onVatSchemeChange={setVatScheme}
                  fiscalStart={fiscalStart}
                  onFiscalStartChange={setFiscalStart}
                />
              )}
              {step === 4 && (
                <StepIndustry selected={industry} onSelect={setIndustry} />
              )}
              {step === 5 && (
                <StepReferral
                  selected={referralSource}
                  other={referralOther}
                  onSelect={setReferralSource}
                  onOtherChange={setReferralOther}
                />
              )}
              {step === 6 && (
                <StepReview
                  orgName={orgName}
                  countryCode={countryCode}
                  registered={registered}
                  fiscalStart={fiscalStart}
                  businessType={businessType}
                  industry={industry}
                  referralSource={referralSource}
                  referralOther={referralOther}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between border-t border-border px-6 py-4 sm:px-10">
          <Button
            variant="ghost"
            onClick={goBack}
            disabled={step === 0}
            className="gap-1.5"
          >
            <ArrowLeft className="size-4" />
            Back
          </Button>

          <div className="flex items-center gap-2">
            {isOptionalStep() && (
              <Button variant="ghost" onClick={goNext} className="text-muted-foreground">
                Skip
              </Button>
            )}
            {step < STEPS.length - 1 ? (
              <Button
                onClick={goNext}
                disabled={!canProceed()}
                className="gap-1.5 bg-brand-600 shadow-md shadow-brand-600/15 hover:bg-brand-700"
              >
                Next
                <ArrowRight className="size-4" />
              </Button>
            ) : (
              <Button
                onClick={handleComplete}
                disabled={submitting}
                className="gap-1.5 bg-brand-600 shadow-md shadow-brand-600/15 hover:bg-brand-700"
              >
                {submitting ? "Setting up..." : "Complete Setup"}
                {!submitting && <Check className="size-4" />}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Step 1: Organization Name ──

function StepOrgName({
  name,
  onNameChange,
}: {
  name: string;
  onNameChange: (v: string) => void;
}) {
  return (
    <div>
      <h2 className="text-xl font-bold tracking-tight text-foreground">
        Name your organization
      </h2>
      <p className="mt-1.5 text-sm text-muted-foreground">
        This is how your organization will appear across dubbl.
      </p>
      <div className="mt-6">
        <div className="space-y-2">
          <Label htmlFor="org-name" className="text-xs font-medium">
            Organization Name
          </Label>
          <Input
            id="org-name"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="My Company"
            autoFocus
            className="h-11 rounded-lg"
          />
        </div>
      </div>
    </div>
  );
}

// ── Step 2: Country ──

function StepCountry({
  selected,
  onSelect,
}: {
  selected: string;
  onSelect: (code: string) => void;
}) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return COUNTRIES;
    const q = search.toLowerCase();
    return COUNTRIES.filter(
      (c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q)
    );
  }, [search]);

  return (
    <div>
      <h2 className="text-xl font-bold tracking-tight text-foreground">
        Where is your business based?
      </h2>
      <p className="mt-1.5 text-sm text-muted-foreground">
        This sets your default currency and available business types.
      </p>
      <div className="relative mt-5">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search countries..."
          className="h-10 rounded-lg pl-9"
          autoFocus
        />
      </div>
      <div className="mt-3 max-h-[280px] space-y-1 overflow-y-auto rounded-lg">
        {filtered.map((c) => (
          <button
            key={c.code}
            onClick={() => onSelect(c.code)}
            className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
              selected === c.code
                ? "bg-foreground/[0.055] text-foreground"
                : "hover:bg-muted/60"
            }`}
          >
            <span className="text-lg">{c.flag}</span>
            <span className="font-medium">{c.name}</span>
            <span className="ml-auto text-xs text-muted-foreground">
              {c.defaultCurrency}
            </span>
          </button>
        ))}
        {filtered.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No countries found
          </p>
        )}
      </div>
    </div>
  );
}

// ── Step 3: Business Type ──

function StepBusinessType({
  countryCode,
  selected,
  onSelect,
}: {
  countryCode: string;
  selected: string;
  onSelect: (code: string) => void;
}) {
  const types = useMemo(
    () => getBusinessTypesForCountry(countryCode),
    [countryCode]
  );

  const country = COUNTRIES.find((c) => c.code === countryCode);

  return (
    <div>
      <h2 className="text-xl font-bold tracking-tight text-foreground">
        What type of business?
      </h2>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Business entity types available in {country?.name ?? "your country"}.
      </p>
      <div className="mt-5 max-h-[320px] space-y-1 overflow-y-auto rounded-lg">
        {types.map((t) => (
          <button
            key={t.code}
            onClick={() => onSelect(t.code)}
            className={`flex w-full flex-col rounded-lg px-3 py-2.5 text-left transition-colors ${
              selected === t.code
                ? "bg-foreground/[0.055] text-foreground"
                : "hover:bg-muted/60"
            }`}
          >
            <span className="text-sm font-medium">{t.localName}</span>
            {t.localName !== t.englishName && (
              <span className="text-xs text-muted-foreground">
                {t.englishName}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Step 4: Tax & financial year ──

function Choice({
  active,
  onClick,
  title,
  hint,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  hint?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex flex-1 flex-col rounded-lg px-3 py-2.5 text-left transition-colors ${
        active ? "bg-foreground/[0.055] text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
      }`}
    >
      <span className="flex items-center gap-1.5 text-sm font-medium">
        {active && <Check className="size-3.5" />}
        {title}
      </span>
      {hint && <span className="mt-0.5 text-xs text-muted-foreground">{hint}</span>}
    </button>
  );
}

function StepTax({
  countryCode,
  registered,
  onRegisteredChange,
  taxId,
  onTaxIdChange,
  vatScheme,
  onVatSchemeChange,
  fiscalStart,
  onFiscalStartChange,
}: {
  countryCode: string;
  registered: boolean;
  onRegisteredChange: (v: boolean) => void;
  taxId: string;
  onTaxIdChange: (v: string) => void;
  vatScheme: "accrual" | "cash";
  onVatSchemeChange: (v: "accrual" | "cash") => void;
  fiscalStart: number;
  onFiscalStartChange: (v: number) => void;
}) {
  const setup = getCountrySetup(countryCode);
  const tax = setup.taxName;

  return (
    <div>
      <h2 className="text-xl font-bold tracking-tight text-foreground">
        Tax and financial year
      </h2>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Pre-filled for {COUNTRIES.find((c) => c.code === countryCode)?.name ?? "your country"}. You can change any of this later in settings.
      </p>

      <div className="mt-6 space-y-5">
        {setup.regime && (
          <div className="space-y-2">
            <Label className="text-xs font-medium">
              {setup.regime === "us_sales_tax" ? "Do you collect sales tax?" : `Are you registered for ${tax}?`}
            </Label>
            <div className="flex gap-2">
              <Choice
                active={registered}
                onClick={() => onRegisteredChange(true)}
                title="Yes"
                hint={setup.regime === "us_sales_tax" ? "Charge tax on invoices" : `Charge and reclaim ${tax}`}
              />
              <Choice
                active={!registered}
                onClick={() => onRegisteredChange(false)}
                title="Not yet"
                hint={`Invoices default to no ${tax}`}
              />
            </div>
          </div>
        )}

        {setup.regime && registered && (
          <div className="space-y-2">
            <Label htmlFor="tax-id" className="text-xs font-medium">
              {setup.taxIdLabel} <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="tax-id"
              value={taxId}
              onChange={(e) => onTaxIdChange(e.target.value)}
              placeholder={setup.taxIdPlaceholder}
              className="h-10 rounded-lg"
            />
          </div>
        )}

        {setup.regime && registered && setup.cashScheme && (
          <div className="space-y-2">
            <Label className="text-xs font-medium">When do you account for {tax}?</Label>
            <div className="flex gap-2">
              <Choice
                active={vatScheme === "accrual"}
                onClick={() => onVatSchemeChange("accrual")}
                title="Invoice basis"
                hint="When you invoice or are billed"
              />
              <Choice
                active={vatScheme === "cash"}
                onClick={() => onVatSchemeChange("cash")}
                title="Cash basis"
                hint="When money is paid or received"
              />
            </div>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="fy-start" className="text-xs font-medium">
            Financial year
          </Label>
          <div className="flex items-center gap-3">
            <select
              id="fy-start"
              value={fiscalStart}
              onChange={(e) => onFiscalStartChange(Number(e.target.value))}
              className="h-10 flex-1 rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              {MONTH_NAMES.map((m, i) => (
                <option key={m} value={i + 1}>
                  Starts 1 {m}
                </option>
              ))}
            </select>
            <span className="shrink-0 text-xs text-muted-foreground">
              Ends {fiscalYearEndLabel(fiscalStart)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Step 5: Industry ──

function StepIndustry({
  selected,
  onSelect,
}: {
  selected: string;
  onSelect: (code: string) => void;
}) {
  return (
    <div>
      <h2 className="text-xl font-bold tracking-tight text-foreground">
        What industry are you in?
      </h2>
      <p className="mt-1.5 text-sm text-muted-foreground">
        This helps us tailor your experience. Optional.
      </p>
      <div className="mt-5 grid grid-cols-2 gap-2">
        {INDUSTRIES.map((ind) => (
          <button
            key={ind.code}
            onClick={() => onSelect(selected === ind.code ? "" : ind.code)}
            className={`rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors ${
              selected === ind.code
                ? "bg-foreground/[0.055] text-foreground"
                : "hover:bg-muted/60"
            }`}
          >
            {ind.name}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Step 6: Referral ──

function StepReferral({
  selected,
  other,
  onSelect,
  onOtherChange,
}: {
  selected: string;
  other: string;
  onSelect: (code: string) => void;
  onOtherChange: (v: string) => void;
}) {
  return (
    <div>
      <h2 className="text-xl font-bold tracking-tight text-foreground">
        How did you hear about us?
      </h2>
      <p className="mt-1.5 text-sm text-muted-foreground">
        This helps us grow. Optional.
      </p>
      <div className="mt-5 grid grid-cols-2 gap-2">
        {REFERRAL_SOURCES.map((src) => (
          <button
            key={src.code}
            onClick={() => onSelect(selected === src.code ? "" : src.code)}
            className={`rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors ${
              selected === src.code
                ? "bg-foreground/[0.055] text-foreground"
                : "hover:bg-muted/60"
            }`}
          >
            {src.name}
          </button>
        ))}
      </div>
      {selected === "other" && (
        <div className="mt-4 space-y-2">
          <Label htmlFor="referral-other" className="text-xs font-medium">
            Please specify
          </Label>
          <Input
            id="referral-other"
            value={other}
            onChange={(e) => onOtherChange(e.target.value)}
            placeholder="Tell us more..."
            className="h-10 rounded-lg"
            autoFocus
          />
        </div>
      )}
    </div>
  );
}

// ── Step 7: Review ──

function StepReview({
  orgName,
  countryCode,
  registered,
  fiscalStart,
  businessType,
  industry,
  referralSource,
  referralOther,
}: {
  orgName: string;
  countryCode: string;
  registered: boolean;
  fiscalStart: number;
  businessType: string;
  industry: string;
  referralSource: string;
  referralOther: string;
}) {
  const setup = getCountrySetup(countryCode);
  const chart = chartTemplateForCountry(countryCode);
  const chartAccounts = seededAccountsFor(chart);
  const keyAccounts = ["1100", "4000", "1200", "2100", "2200", "3100"]
    .map((role) => chartAccounts.find((a) => a.roles?.includes(role)))
    .filter((a): a is NonNullable<typeof a> => !!a);
  const country = COUNTRIES.find((c) => c.code === countryCode);
  const types = getBusinessTypesForCountry(countryCode);
  const bt = types.find((t) => t.code === businessType);
  const ind = INDUSTRIES.find((i) => i.code === industry);
  const ref = REFERRAL_SOURCES.find((r) => r.code === referralSource);

  const items: { label: string; value: string }[] = [
    { label: "Organization", value: orgName },
    {
      label: "Country",
      value: country ? `${country.flag} ${country.name}` : "-",
    },
    { label: "Currency", value: country?.defaultCurrency ?? "-" },
    { label: "Business Type", value: bt?.localName ?? "-" },
    ...(setup.regime
      ? [{ label: setup.taxName, value: registered ? "Registered" : "Not registered" }]
      : []),
    { label: "Financial year end", value: fiscalYearEndLabel(fiscalStart) },
    { label: "Industry", value: ind?.name ?? "-" },
    {
      label: "Referral",
      value:
        referralSource === "other" && referralOther
          ? referralOther
          : ref?.name ?? "-",
    },
  ];

  return (
    <div>
      <h2 className="text-xl font-bold tracking-tight text-foreground">
        You&apos;re all set
      </h2>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Review your details before getting started.
      </p>
      <div className="mt-6 space-y-3">
        {items.map((item) => (
          <div
            key={item.label}
            className="flex items-center justify-between rounded-lg bg-muted/40 px-4 py-3"
          >
            <span className="text-sm text-muted-foreground">{item.label}</span>
            <span className="text-sm font-medium text-foreground">
              {item.value}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-lg border border-border/70 px-4 py-3">
        <div className="flex items-start gap-2.5">
          <Info className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <p className="text-xs font-medium text-foreground">
              {chart.name} · {chartAccounts.length} accounts
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {keyAccounts.map((a) => `${a.code} ${a.name}`).join(" · ")}
            </p>
            {setup.regime && (
              <p className="mt-1.5 text-xs text-muted-foreground">
                Standard {setup.taxName} rates are added and each account gets its usual default rate. Review the chart with your accountant if you have local requirements.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
