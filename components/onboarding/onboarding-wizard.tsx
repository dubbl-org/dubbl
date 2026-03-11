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
} from "lucide-react";
import {
  COUNTRIES,
  getBusinessTypesForCountry,
  type Country,
  type BusinessType,
} from "@/lib/data/business-types";
import { INDUSTRIES, type Industry } from "@/lib/data/industries";
import { REFERRAL_SOURCES, type ReferralSource } from "@/lib/data/referral-sources";

const STEPS = [
  { label: "Organization", icon: Building2 },
  { label: "Country", icon: Globe },
  { label: "Business Type", icon: Briefcase },
  { label: "Industry", icon: Factory },
  { label: "Referral", icon: Megaphone },
  { label: "Review", icon: ClipboardCheck },
];

interface OrgData {
  id: string;
  name: string;
  country: string | null;
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

  // Load existing org data
  useEffect(() => {
    const activeOrgId = localStorage.getItem("activeOrgId");
    if (!activeOrgId) {
      setLoading(false);
      return;
    }

    fetch("/api/v1/organization", {
      headers: { "x-organization-id": activeOrgId },
    })
      .then((r) => r.json())
      .then((data) => {
        const org = data.organization as OrgData | undefined;
        if (org) {
          setOrgId(org.id);
          setOrgName(org.name);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
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
      case 3: // optional
      case 4: // optional
        return true;
      default:
        return true;
    }
  }

  function isOptionalStep(): boolean {
    return step === 3 || step === 4;
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
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update organization");
      }

      window.location.href = "/dashboard";
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="w-full max-w-lg">
      {/* Progress dots */}
      <div className="mb-8 flex items-center justify-center gap-2">
        {STEPS.map((s, i) => (
          <div
            key={i}
            className={`flex h-2.5 w-2.5 rounded-full transition-all duration-300 ${
              i === step
                ? "scale-125 bg-emerald-500"
                : i < step
                  ? "bg-emerald-500/50"
                  : "bg-foreground/15"
            }`}
          />
        ))}
      </div>

      {/* Step content */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-2xl shadow-black/5 dark:shadow-black/40">
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
                <StepIndustry selected={industry} onSelect={setIndustry} />
              )}
              {step === 4 && (
                <StepReferral
                  selected={referralSource}
                  other={referralOther}
                  onSelect={setReferralSource}
                  onOtherChange={setReferralOther}
                />
              )}
              {step === 5 && (
                <StepReview
                  orgName={orgName}
                  countryCode={countryCode}
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
                className="gap-1.5 bg-emerald-600 shadow-md shadow-emerald-600/15 hover:bg-emerald-500"
              >
                Next
                <ArrowRight className="size-4" />
              </Button>
            ) : (
              <Button
                onClick={handleComplete}
                disabled={submitting}
                className="gap-1.5 bg-emerald-600 shadow-md shadow-emerald-600/15 hover:bg-emerald-500"
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
                ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
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
                ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
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

// ── Step 4: Industry ──

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
                ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
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

// ── Step 5: Referral ──

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
                ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
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

// ── Step 6: Review ──

function StepReview({
  orgName,
  countryCode,
  businessType,
  industry,
  referralSource,
  referralOther,
}: {
  orgName: string;
  countryCode: string;
  businessType: string;
  industry: string;
  referralSource: string;
  referralOther: string;
}) {
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
    </div>
  );
}
