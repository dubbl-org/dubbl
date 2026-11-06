"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { toast } from "sonner";
import Link from "next/link";
import { Save, Plus, Trash2, Shield, Clock, CalendarDays, DollarSign, Layers, ExternalLink, ListOrdered, ArrowUp, ArrowDown } from "lucide-react";
import { Section } from "@/components/dashboard/section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { ContentReveal } from "@/components/ui/content-reveal";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { Switch } from "@/components/ui/switch";
import { CurrencySelect } from "@/components/ui/currency-select";
import { cn } from "@/lib/utils";
import { useConfirm } from "@/lib/hooks/use-confirm";
import { useApi } from "@/lib/query/use-api";

interface PayrollSettingsData {
  defaultTaxRate: number;
  overtimeThresholdHours: number;
  overtimeMultiplier: number;
  defaultCurrency: string;
  salaryExpenseAccountCode: string;
  taxPayableAccountCode: string;
  bankAccountCode: string;
  autoApprovalEnabled: boolean;
  // Payroll tax parameters: rates in basis points (620 = 6.2%), amounts in annual cents
  ssWageBaseCents: number;
  ssRateBp: number;
  medicareRateBp: number;
  addlMedicareThresholdCents: number;
  addlMedicareRateBp: number;
  employerFicaEnabled: boolean;
  futaRateBp: number;
  futaWageBaseCents: number;
  sutaRateBp: number;
  sutaWageBaseCents: number;
  defaultTaxYear: number | null;
}

/** The payroll tax fields as typed: rates in percent, wage bases in dollars. */
interface TaxParamsForm {
  ssRate: string;
  ssWageBase: string;
  medicareRate: string;
  addlMedicareRate: string;
  addlMedicareThreshold: string;
  employerFicaEnabled: boolean;
  futaRate: string;
  futaWageBase: string;
  sutaRate: string;
  sutaWageBase: string;
  defaultTaxYear: string;
}

const bpToPercent = (bp: number) => String(bp / 100);
const centsToDollars = (cents: number) => (cents / 100).toFixed(2);
/** "6.2" (percent) → 620 basis points */
const percentToBp = (v: string) => Math.max(0, Math.round((parseFloat(v) || 0) * 100));
/** "168100.00" (dollars) → 16810000 cents */
const dollarsToCents = (v: string) => Math.max(0, Math.round((parseFloat(v) || 0) * 100));

function toTaxParamsForm(s: PayrollSettingsData): TaxParamsForm {
  return {
    ssRate: bpToPercent(s.ssRateBp),
    ssWageBase: centsToDollars(s.ssWageBaseCents),
    medicareRate: bpToPercent(s.medicareRateBp),
    addlMedicareRate: bpToPercent(s.addlMedicareRateBp),
    addlMedicareThreshold: centsToDollars(s.addlMedicareThresholdCents),
    employerFicaEnabled: s.employerFicaEnabled,
    futaRate: bpToPercent(s.futaRateBp),
    futaWageBase: centsToDollars(s.futaWageBaseCents),
    sutaRate: bpToPercent(s.sutaRateBp),
    sutaWageBase: centsToDollars(s.sutaWageBaseCents),
    defaultTaxYear: s.defaultTaxYear ? String(s.defaultTaxYear) : "",
  };
}

const ACCRUAL_HELP: Record<string, string> = {
  per_pay_period: "Hours earned × finished regular pay runs this year.",
  monthly: "Hours earned each month, counted from the employee's start date.",
  annually: "Hours earned per year, built up day by day.",
  front_loaded: "The full amount on January 1 (or the start date for new joiners).",
};

const FILING_STATUS_LABELS: Record<string, string> = {
  single: "Single",
  married_joint: "Married filing jointly",
  married_separate: "Married filing separately",
  head_of_household: "Head of household",
};

interface Member {
  id: string;
  userName: string | null;
  userEmail: string;
}

interface ChainForm {
  id: string | null; // null = new chain
  name: string;
  description: string;
  isActive: boolean;
  approverIds: string[]; // in sign-off order
}

const EMPTY_CHAIN_FORM: ChainForm = { id: null, name: "", description: "", isActive: true, approverIds: [] };

const EMPTY_BRACKET = { name: "", jurisdictionLevel: "federal", jurisdiction: "", filingStatus: "all", taxYear: "", minIncome: "", maxIncome: "", rate: "" };

interface DeductionType {
  id: string;
  name: string;
  description: string | null;
  category: string;
  defaultAmount: number | null;
  defaultPercent: number | null;
  isActive: boolean;
}

interface TaxBracket {
  id: string;
  name: string;
  jurisdictionLevel: string;
  jurisdiction: string | null;
  filingStatus: string | null;
  taxYear: number | null;
  minIncome: number;
  maxIncome: number | null;
  rate: number;
}

interface ShiftDef {
  id: string;
  name: string;
  shiftType: string;
  startTime: string;
  endTime: string;
  premiumPercent: number | null;
  isActive: boolean;
}

interface LeavePolicy {
  id: string;
  name: string;
  leaveType: string;
  accrualMethod: string;
  accrualRate: number;
  maxBalance: number | null;
  carryOverMax: number | null;
  isActive: boolean;
}

interface ApprovalChain {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  steps: {
    id: string;
    stepOrder: number;
    approverId: string;
    approver: { user: { name: string | null; email: string } | null } | null;
  }[];
}

interface CompensationBand {
  id: string;
  name: string;
  level: string;
  minSalary: number;
  midSalary: number;
  maxSalary: number;
}

const DEFAULT_SETTINGS: PayrollSettingsData = {
  defaultTaxRate: 2000,
  overtimeThresholdHours: 40,
  overtimeMultiplier: 1.5,
  defaultCurrency: "USD",
  salaryExpenseAccountCode: "5100",
  taxPayableAccountCode: "2200",
  bankAccountCode: "1100",
  autoApprovalEnabled: false,
  ssWageBaseCents: 16810000,
  ssRateBp: 620,
  medicareRateBp: 145,
  addlMedicareThresholdCents: 20000000,
  addlMedicareRateBp: 90,
  employerFicaEnabled: true,
  futaRateBp: 60,
  futaWageBaseCents: 700000,
  sutaRateBp: 0,
  sutaWageBaseCents: 0,
  defaultTaxYear: null,
};

const anim = (delay: number) => ({
  initial: { opacity: 0, y: 12 } as const,
  animate: { opacity: 1, y: 0 } as const,
  transition: { duration: 0.3, delay } as const,
});

export default function PayrollSettingsPage() {
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [saving, setSaving] = useState(false);

  const { data: settingsData, loading: settingsLoading, refetch: refetchSettings } = useApi<{ settings?: PayrollSettingsData }>("/api/v1/payroll/settings");
  const { data: deductionsData, loading: deductionsLoading } = useApi<{ data?: DeductionType[] }>("/api/v1/payroll/deductions/types");
  const { data: bracketsData, loading: bracketsLoading } = useApi<{ data?: TaxBracket[] }>("/api/v1/payroll/tax/brackets");
  const { data: shiftsData, loading: shiftsLoading } = useApi<{ data?: ShiftDef[] }>("/api/v1/payroll/shifts");
  const { data: leaveData, loading: leaveLoading } = useApi<{ data?: LeavePolicy[] }>("/api/v1/payroll/leave/policies");
  const { data: chainsData, loading: chainsLoading } = useApi<{ data?: ApprovalChain[] }>("/api/v1/payroll/approval-chains");
  const { data: bandsData, loading: bandsLoading } = useApi<{ data?: CompensationBand[] }>("/api/v1/payroll/compensation/bands");
  const { data: membersData } = useApi<{ members?: Member[] }>("/api/v1/members");
  const loading = settingsLoading || deductionsLoading || bracketsLoading || shiftsLoading || leaveLoading || chainsLoading || bandsLoading;
  const members = membersData?.members ?? [];

  // Settings (seeded from the saved settings until edited)
  const [draft, setSettings] = useState<PayrollSettingsData | null>(null);
  const settings = draft ?? settingsData?.settings ?? DEFAULT_SETTINGS;

  // Payroll taxes (seeded from the saved settings until edited)
  const [taxDraft, setTaxDraft] = useState<TaxParamsForm | null>(null);
  const taxForm = taxDraft ?? toTaxParamsForm(settingsData?.settings ?? DEFAULT_SETTINGS);
  const setTaxField = <K extends keyof TaxParamsForm>(key: K, value: TaxParamsForm[K]) =>
    setTaxDraft({ ...taxForm, [key]: value });
  const [taxSaving, setTaxSaving] = useState(false);

  // Deduction types
  const deductionTypes = deductionsData?.data ?? [];
  const [deductionDrawer, setDeductionDrawer] = useState(false);
  const [newDeduction, setNewDeduction] = useState({ name: "", category: "post_tax", defaultAmount: "", defaultPercent: "" });

  // Tax brackets
  const taxBrackets = bracketsData?.data ?? [];
  const [bracketDrawer, setBracketDrawer] = useState(false);
  const [newBracket, setNewBracket] = useState(EMPTY_BRACKET);

  // Shifts
  const shifts = shiftsData?.data ?? [];
  const [shiftDrawer, setShiftDrawer] = useState(false);
  const [newShift, setNewShift] = useState({ name: "", shiftType: "regular", startTime: "09:00", endTime: "17:00", premiumPercent: "0" });

  // Leave policies
  const leavePolicies = leaveData?.data ?? [];
  const [leaveDrawer, setLeaveDrawer] = useState(false);
  const [newLeave, setNewLeave] = useState({ name: "", leaveType: "vacation", accrualMethod: "per_pay_period", accrualRate: "0", maxBalance: "", carryOverMax: "" });

  // Approval chains
  const approvalChains = chainsData?.data ?? [];
  const [chainDrawer, setChainDrawer] = useState(false);
  const [chainForm, setChainForm] = useState<ChainForm>(EMPTY_CHAIN_FORM);
  const [chainSaving, setChainSaving] = useState(false);
  const memberLabel = (memberId: string) => {
    const m = members.find((x) => x.id === memberId);
    return m ? (m.userName ? `${m.userName} (${m.userEmail})` : m.userEmail) : "Unknown member";
  };

  // Compensation bands
  const compensationBands = bandsData?.data ?? [];
  const [bandDrawer, setBandDrawer] = useState(false);
  const [newBand, setNewBand] = useState({ name: "", level: "", minSalary: "", midSalary: "", maxSalary: "" });

  const orgId = typeof window !== "undefined" ? localStorage.getItem("activeOrgId") : null;

  async function handleSaveSettings() {
    if (!orgId) return;
    setSaving(true);
    try {
      // Only the General fields; the saved row also carries ids and timestamps.
      const res = await fetch("/api/v1/payroll/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify({
          defaultTaxRate: settings.defaultTaxRate,
          overtimeThresholdHours: settings.overtimeThresholdHours,
          overtimeMultiplier: settings.overtimeMultiplier,
          defaultCurrency: settings.defaultCurrency,
          salaryExpenseAccountCode: settings.salaryExpenseAccountCode || undefined,
          taxPayableAccountCode: settings.taxPayableAccountCode || undefined,
          bankAccountCode: settings.bankAccountCode || undefined,
          autoApprovalEnabled: settings.autoApprovalEnabled,
        }),
      });
      if (res.ok) {
        toast.success("Settings saved");
        await refetchSettings();
        setSettings(null);
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(typeof data.error === "string" ? data.error : "Failed to save settings");
      }
    } catch {
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveTaxParams() {
    if (!orgId) return;
    const year = taxForm.defaultTaxYear.trim() ? parseInt(taxForm.defaultTaxYear, 10) : null;
    if (year !== null && (!Number.isInteger(year) || year < 2000 || year > 2100)) {
      toast.error("Tax year must be between 2000 and 2100");
      return;
    }
    setTaxSaving(true);
    try {
      const res = await fetch("/api/v1/payroll/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify({
          ssRateBp: percentToBp(taxForm.ssRate),
          ssWageBaseCents: dollarsToCents(taxForm.ssWageBase),
          medicareRateBp: percentToBp(taxForm.medicareRate),
          addlMedicareRateBp: percentToBp(taxForm.addlMedicareRate),
          addlMedicareThresholdCents: dollarsToCents(taxForm.addlMedicareThreshold),
          employerFicaEnabled: taxForm.employerFicaEnabled,
          futaRateBp: percentToBp(taxForm.futaRate),
          futaWageBaseCents: dollarsToCents(taxForm.futaWageBase),
          sutaRateBp: percentToBp(taxForm.sutaRate),
          sutaWageBaseCents: dollarsToCents(taxForm.sutaWageBase),
          defaultTaxYear: year,
        }),
      });
      if (res.ok) {
        toast.success("Payroll taxes saved");
        await refetchSettings();
        setTaxDraft(null);
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(typeof data.error === "string" ? data.error : "Failed to save payroll taxes");
      }
    } catch {
      toast.error("Failed to save payroll taxes");
    } finally {
      setTaxSaving(false);
    }
  }

  function openChainDrawer(chain?: ApprovalChain) {
    setChainForm(
      chain
        ? {
            id: chain.id,
            name: chain.name,
            description: chain.description ?? "",
            isActive: chain.isActive,
            approverIds: [...chain.steps].sort((a, b) => a.stepOrder - b.stepOrder).map((s) => s.approverId),
          }
        : EMPTY_CHAIN_FORM
    );
    setChainDrawer(true);
  }

  function moveApprover(index: number, delta: number) {
    const ids = [...chainForm.approverIds];
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    setChainForm({ ...chainForm, approverIds: ids });
  }

  async function handleSaveChain() {
    if (!orgId || !chainForm.name.trim()) return;
    if (chainForm.approverIds.length === 0) {
      toast.error("Add at least one approver");
      return;
    }
    setChainSaving(true);
    try {
      const res = await fetch(
        chainForm.id ? `/api/v1/payroll/approval-chains/${chainForm.id}` : "/api/v1/payroll/approval-chains",
        {
          method: chainForm.id ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json", "x-organization-id": orgId },
          body: JSON.stringify({
            name: chainForm.name.trim(),
            description: chainForm.description.trim() || (chainForm.id ? null : undefined),
            isActive: chainForm.isActive,
            steps: chainForm.approverIds.map((approverId, i) => ({ stepOrder: i + 1, approverId })),
          }),
        }
      );
      if (res.ok) {
        toast.success(chainForm.id ? "Approval chain updated" : "Approval chain added");
        setChainDrawer(false);
        setChainForm(EMPTY_CHAIN_FORM);
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(typeof data.error === "string" ? data.error : "Failed to save approval chain");
      }
    } catch {
      toast.error("Failed to save approval chain");
    } finally {
      setChainSaving(false);
    }
  }

  async function handleDeleteChain(chain: ApprovalChain) {
    if (!orgId) return;
    const confirmed = await confirm({
      title: "Delete approval chain?",
      description: `Pay runs will no longer need sign-off from "${chain.name}". Runs already waiting for sign-off keep their approvers.`,
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!confirmed) return;
    const res = await fetch(`/api/v1/payroll/approval-chains/${chain.id}`, {
      method: "DELETE",
      headers: { "x-organization-id": orgId },
    });
    if (res.ok) toast.success("Approval chain deleted");
    else toast.error("Failed to delete approval chain");
  }

  async function handleDeleteBracket(id: string) {
    if (!orgId) return;
    const confirmed = await confirm({
      title: "Delete tax bracket?",
      description: "Future pay runs won't use this bracket. Finished pay runs aren't changed.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!confirmed) return;
    const res = await fetch(`/api/v1/payroll/tax/brackets/${id}`, {
      method: "DELETE",
      headers: { "x-organization-id": orgId },
    });
    if (res.ok) toast.success("Tax bracket deleted");
    else toast.error("Failed to delete tax bracket");
  }

  async function handleAddDeduction() {
    if (!orgId || !newDeduction.name) return;
    try {
      const res = await fetch("/api/v1/payroll/deductions/types", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify({
          name: newDeduction.name,
          category: newDeduction.category,
          defaultAmount: newDeduction.defaultAmount ? Math.round(parseFloat(newDeduction.defaultAmount) * 100) : undefined,
          defaultPercent: newDeduction.defaultPercent ? parseFloat(newDeduction.defaultPercent) : undefined,
        }),
      });
      if (res.ok) {
        toast.success("Deduction type added");
        setDeductionDrawer(false);
        setNewDeduction({ name: "", category: "post_tax", defaultAmount: "", defaultPercent: "" });
      }
    } catch {
      toast.error("Failed to add deduction type");
    }
  }

  async function handleDeleteDeduction(id: string) {
    if (!orgId) return;
    const confirmed = await confirm({
      title: "Delete deduction type?",
      description: "This will remove the deduction type. Existing employee deductions using it won't be affected.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!confirmed) return;
    await fetch(`/api/v1/payroll/deductions/types/${id}`, {
      method: "DELETE",
      headers: { "x-organization-id": orgId },
    });
  }

  async function handleAddBracket() {
    if (!orgId || !newBracket.name) return;
    const code = newBracket.jurisdiction.trim().toUpperCase();
    if (newBracket.jurisdictionLevel !== "federal" && !code) {
      toast.error("Enter the state or local code, e.g. CA");
      return;
    }
    const taxYear = newBracket.taxYear.trim() ? parseInt(newBracket.taxYear, 10) : null;
    try {
      const res = await fetch("/api/v1/payroll/tax/brackets", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify({
          name: newBracket.name,
          jurisdictionLevel: newBracket.jurisdictionLevel,
          jurisdiction: newBracket.jurisdictionLevel === "federal" ? undefined : code,
          filingStatus: newBracket.filingStatus === "all" ? null : newBracket.filingStatus,
          taxYear: Number.isInteger(taxYear) ? taxYear : null,
          minIncome: Math.round(parseFloat(newBracket.minIncome || "0") * 100),
          maxIncome: newBracket.maxIncome ? Math.round(parseFloat(newBracket.maxIncome) * 100) : null,
          rate: Math.round(parseFloat(newBracket.rate || "0") * 100),
        }),
      });
      if (res.ok) {
        toast.success("Tax bracket added");
        setBracketDrawer(false);
        setNewBracket(EMPTY_BRACKET);
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(typeof data.error === "string" ? data.error : "Failed to add tax bracket");
      }
    } catch {
      toast.error("Failed to add tax bracket");
    }
  }

  async function handleAddShift() {
    if (!orgId || !newShift.name) return;
    try {
      const res = await fetch("/api/v1/payroll/shifts", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify({
          name: newShift.name,
          shiftType: newShift.shiftType,
          startTime: newShift.startTime,
          endTime: newShift.endTime,
          premiumPercent: parseFloat(newShift.premiumPercent || "0"),
        }),
      });
      if (res.ok) {
        toast.success("Shift added");
        setShiftDrawer(false);
        setNewShift({ name: "", shiftType: "regular", startTime: "09:00", endTime: "17:00", premiumPercent: "0" });
      }
    } catch {
      toast.error("Failed to add shift");
    }
  }

  async function handleAddLeavePolicy() {
    if (!orgId || !newLeave.name) return;
    try {
      const res = await fetch("/api/v1/payroll/leave/policies", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify({
          name: newLeave.name,
          leaveType: newLeave.leaveType,
          accrualMethod: newLeave.accrualMethod,
          accrualRate: parseFloat(newLeave.accrualRate || "0"),
          maxBalance: newLeave.maxBalance ? parseFloat(newLeave.maxBalance) : null,
          carryOverMax: newLeave.carryOverMax ? parseFloat(newLeave.carryOverMax) : null,
        }),
      });
      if (res.ok) {
        toast.success("Leave policy added");
        setLeaveDrawer(false);
        setNewLeave({ name: "", leaveType: "vacation", accrualMethod: "per_pay_period", accrualRate: "0", maxBalance: "", carryOverMax: "" });
      }
    } catch {
      toast.error("Failed to add leave policy");
    }
  }

  async function handleAddBand() {
    if (!orgId || !newBand.name) return;
    try {
      const res = await fetch("/api/v1/payroll/compensation/bands", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify({
          name: newBand.name,
          level: newBand.level,
          minSalary: Math.round(parseFloat(newBand.minSalary || "0") * 100),
          midSalary: Math.round(parseFloat(newBand.midSalary || "0") * 100),
          maxSalary: Math.round(parseFloat(newBand.maxSalary || "0") * 100),
        }),
      });
      if (res.ok) {
        toast.success("Compensation band added");
        setBandDrawer(false);
        setNewBand({ name: "", level: "", minSalary: "", midSalary: "", maxSalary: "" });
      }
    } catch {
      toast.error("Failed to add compensation band");
    }
  }

  async function handleDeleteBand(id: string) {
    if (!orgId) return;
    const confirmed = await confirm({
      title: "Delete compensation band?",
      description: "This action cannot be undone.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!confirmed) return;
    await fetch(`/api/v1/payroll/compensation/bands/${id}`, {
      method: "DELETE",
      headers: { "x-organization-id": orgId },
    });
  }

  if (loading) return <BrandLoader />;

  return (
    <ContentReveal className="space-y-6">
      <div className="space-y-8">
        {/* General Settings */}
        <motion.div {...anim(0)}>
          <Section title="General" description="Default payroll configuration.">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Default Tax Rate (%)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={(settings.defaultTaxRate / 100).toFixed(2)}
                  onChange={(e) => setSettings({ ...settings, defaultTaxRate: Math.round(parseFloat(e.target.value || "0") * 100) })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Overtime after (hours per week)</Label>
                <Input
                  type="number"
                  value={settings.overtimeThresholdHours}
                  onChange={(e) => setSettings({ ...settings, overtimeThresholdHours: parseFloat(e.target.value || "40") })}
                />
                <p className="text-[11px] text-muted-foreground">Checked week by week within each pay period.</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Overtime multiplier</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={settings.overtimeMultiplier}
                  onChange={(e) => setSettings({ ...settings, overtimeMultiplier: parseFloat(e.target.value || "1.5") })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Default Currency</Label>
                <CurrencySelect
                  value={settings.defaultCurrency}
                  onValueChange={(v) => setSettings({ ...settings, defaultCurrency: v })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Salary Expense Account</Label>
                <Input
                  value={settings.salaryExpenseAccountCode}
                  onChange={(e) => setSettings({ ...settings, salaryExpenseAccountCode: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Tax Payable Account</Label>
                <Input
                  value={settings.taxPayableAccountCode}
                  onChange={(e) => setSettings({ ...settings, taxPayableAccountCode: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Bank Account</Label>
                <Input
                  value={settings.bankAccountCode}
                  onChange={(e) => setSettings({ ...settings, bankAccountCode: e.target.value })}
                />
              </div>
              <div className="flex items-start gap-3 pt-5 sm:col-span-2">
                <Switch
                  id="auto-approve"
                  checked={settings.autoApprovalEnabled}
                  onCheckedChange={(v: boolean) => setSettings({ ...settings, autoApprovalEnabled: v })}
                />
                <div className="space-y-0.5">
                  <Label htmlFor="auto-approve" className="text-xs">Auto-approve payroll runs</Label>
                  <p className="text-[11px] text-muted-foreground">
                    When on, pay runs can be finished without sign-off, even when an approval chain is active.
                  </p>
                </div>
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <Button
                size="sm"
                onClick={handleSaveSettings}
                disabled={saving}
                className="bg-brand-600 hover:bg-brand-700"
              >
                <Save className="mr-1.5 size-3.5" />
                {saving ? "Saving..." : "Save Settings"}
              </Button>
            </div>
          </Section>
        </motion.div>

        <div className="h-px bg-border" />

        {/* Payroll taxes */}
        <motion.div {...anim(0.03)}>
          <Section title="Payroll taxes" description="Social Security, Medicare and unemployment tax rates used in every pay run. Rates are percentages; wage bases and thresholds are yearly amounts.">
            <div className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Social Security rate (%)</Label>
                  <Input type="number" step="0.01" min="0" value={taxForm.ssRate} onChange={(e) => setTaxField("ssRate", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Social Security wage base</Label>
                  <CurrencyInput prefix="$" value={taxForm.ssWageBase} onChange={(v) => setTaxField("ssWageBase", v)} />
                  <p className="text-[11px] text-muted-foreground">No Social Security on yearly pay above this.</p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Medicare rate (%)</Label>
                  <Input type="number" step="0.01" min="0" value={taxForm.medicareRate} onChange={(e) => setTaxField("medicareRate", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Additional Medicare rate (%)</Label>
                  <Input type="number" step="0.01" min="0" value={taxForm.addlMedicareRate} onChange={(e) => setTaxField("addlMedicareRate", e.target.value)} />
                  <p className="text-[11px] text-muted-foreground">Employee only, no employer match.</p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Additional Medicare threshold</Label>
                  <CurrencyInput prefix="$" value={taxForm.addlMedicareThreshold} onChange={(v) => setTaxField("addlMedicareThreshold", v)} />
                  <p className="text-[11px] text-muted-foreground">Applies to yearly pay above this.</p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Tax year for brackets</Label>
                  <Input
                    type="number"
                    min="2000"
                    max="2100"
                    value={taxForm.defaultTaxYear}
                    onChange={(e) => setTaxField("defaultTaxYear", e.target.value)}
                    placeholder="Year of the pay period"
                  />
                  <p className="text-[11px] text-muted-foreground">Leave blank to use the year of each pay period.</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Switch
                  id="employer-fica"
                  checked={taxForm.employerFicaEnabled}
                  onCheckedChange={(v: boolean) => setTaxField("employerFicaEnabled", v)}
                />
                <div className="space-y-0.5">
                  <Label htmlFor="employer-fica" className="text-xs">Employer pays matching Social Security and Medicare</Label>
                  <p className="text-[11px] text-muted-foreground">Turn off only if your organization is exempt from the employer share.</p>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">FUTA rate (%)</Label>
                  <Input type="number" step="0.01" min="0" value={taxForm.futaRate} onChange={(e) => setTaxField("futaRate", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">FUTA wage base</Label>
                  <CurrencyInput prefix="$" value={taxForm.futaWageBase} onChange={(v) => setTaxField("futaWageBase", v)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">SUTA rate (%)</Label>
                  <Input type="number" step="0.01" min="0" value={taxForm.sutaRate} onChange={(e) => setTaxField("sutaRate", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">SUTA wage base</Label>
                  <CurrencyInput prefix="$" value={taxForm.sutaWageBase} onChange={(v) => setTaxField("sutaWageBase", v)} />
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">
                FUTA and SUTA are federal and state unemployment taxes. Your business pays them; they aren&apos;t taken from employees&apos; pay.
              </p>
            </div>
            <div className="mt-4 flex justify-end">
              <Button
                size="sm"
                onClick={handleSaveTaxParams}
                disabled={taxSaving}
                className="bg-brand-600 hover:bg-brand-700"
              >
                <Save className="mr-1.5 size-3.5" />
                {taxSaving ? "Saving..." : "Save Payroll Taxes"}
              </Button>
            </div>
          </Section>
        </motion.div>

        <div className="h-px bg-border" />

        {/* Deduction Types */}
        <motion.div {...anim(0.05)}>
          <Section title="Deduction Types" description="Manage recurring deduction categories.">
            <div className="space-y-3">
              <div className="flex justify-end">
                <Button size="sm" variant="outline" onClick={() => setDeductionDrawer(true)}>
                  <Plus className="mr-1.5 size-3" />
                  Add Type
                </Button>
              </div>
              {deductionTypes.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No deduction types configured</p>
              ) : (
                <div className="rounded-lg border divide-y">
                  {deductionTypes.map((dt) => (
                    <div key={dt.id} className="flex items-center justify-between px-4 py-2.5">
                      <div>
                        <p className="text-sm font-medium">{dt.name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Badge variant="outline" className="text-[10px]">{dt.category === "pre_tax" ? "Pre-tax" : "Post-tax"}</Badge>
                          {dt.defaultAmount && <span className="text-xs text-muted-foreground">${(dt.defaultAmount / 100).toFixed(2)}</span>}
                          {dt.defaultPercent && <span className="text-xs text-muted-foreground">{dt.defaultPercent}%</span>}
                        </div>
                      </div>
                      <Button size="icon" variant="ghost" className="size-7" onClick={() => handleDeleteDeduction(dt.id)}>
                        <Trash2 className="size-3.5 text-muted-foreground" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Section>
        </motion.div>

        <div className="h-px bg-border" />

        {/* Tax Brackets */}
        <motion.div {...anim(0.1)}>
          <Section title="Tax Brackets" description="Configure progressive tax rates.">
            <div className="space-y-3">
              <div className="flex justify-end">
                <Button size="sm" variant="outline" onClick={() => setBracketDrawer(true)}>
                  <Plus className="mr-1.5 size-3" />
                  Add Bracket
                </Button>
              </div>
              {taxBrackets.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No tax brackets configured</p>
              ) : (
                <div className="rounded-lg border divide-y">
                  {taxBrackets.map((b) => (
                    <div key={b.id} className="flex items-center justify-between px-4 py-2.5">
                      <div>
                        <p className="text-sm font-medium">{b.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {b.jurisdictionLevel}{b.jurisdiction ? ` · ${b.jurisdiction}` : ""} · {b.filingStatus ? FILING_STATUS_LABELS[b.filingStatus] ?? b.filingStatus : "All filing statuses"} · {b.taxYear ?? "Any year"} · ${(b.minIncome / 100).toLocaleString()}{b.maxIncome ? ` - $${(b.maxIncome / 100).toLocaleString()}` : "+"} · {(b.rate / 100).toFixed(2)}%
                        </p>
                      </div>
                      <Button size="icon" variant="ghost" className="size-7" aria-label={`Delete ${b.name}`} onClick={() => handleDeleteBracket(b.id)}>
                        <Trash2 className="size-3.5 text-muted-foreground" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Section>
        </motion.div>

        <div className="h-px bg-border" />

        {/* Shift Definitions */}
        <motion.div {...anim(0.15)}>
          <Section title="Shifts" description="Define work shifts and premiums.">
            <div className="space-y-3">
              <div className="flex justify-end">
                <Button size="sm" variant="outline" onClick={() => setShiftDrawer(true)}>
                  <Plus className="mr-1.5 size-3" />
                  Add Shift
                </Button>
              </div>
              {shifts.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No shifts configured</p>
              ) : (
                <div className="rounded-lg border divide-y">
                  {shifts.map((s) => (
                    <div key={s.id} className="flex items-center justify-between px-4 py-2.5">
                      <div>
                        <p className="text-sm font-medium">{s.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {s.startTime} - {s.endTime} · {s.shiftType}{s.premiumPercent ? ` · +${s.premiumPercent}%` : ""}
                        </p>
                      </div>
                      <Badge variant="outline" className={cn("text-[10px]", s.isActive ? "text-brand-600" : "text-muted-foreground")}>
                        {s.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Section>
        </motion.div>

        <div className="h-px bg-border" />

        {/* Leave Policies */}
        <motion.div {...anim(0.2)}>
          <Section title="Leave Policies" description="Configure PTO and leave accrual rules.">
            <div className="space-y-3">
              <div className="flex justify-end">
                <Button size="sm" variant="outline" onClick={() => setLeaveDrawer(true)}>
                  <Plus className="mr-1.5 size-3" />
                  Add Policy
                </Button>
              </div>
              {leavePolicies.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No leave policies configured</p>
              ) : (
                <div className="rounded-lg border divide-y">
                  {leavePolicies.map((p) => (
                    <div key={p.id} className="flex items-center justify-between px-4 py-2.5">
                      <div>
                        <p className="text-sm font-medium">{p.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {p.leaveType} · {p.accrualRate}h/{p.accrualMethod.replace(/_/g, " ")}{p.maxBalance ? ` · Max ${p.maxBalance}h` : ""}{p.carryOverMax != null ? ` · Carry over up to ${p.carryOverMax}h` : ""}
                        </p>
                        {ACCRUAL_HELP[p.accrualMethod] && (
                          <p className="text-[11px] text-muted-foreground">{ACCRUAL_HELP[p.accrualMethod]}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Section>
        </motion.div>

        <div className="h-px bg-border" />

        {/* Approval Chains */}
        <motion.div {...anim(0.25)}>
          <Section title="Approval Chains" description="Who signs off a pay run before it can be finished, in order. When more than one chain is active, the oldest one is used.">
            <div className="space-y-3">
              <div className="flex justify-end">
                <Button size="sm" variant="outline" onClick={() => openChainDrawer()}>
                  <Plus className="mr-1.5 size-3" />
                  Add Chain
                </Button>
              </div>
              {approvalChains.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No approval chains configured</p>
              ) : (
                <div className="rounded-lg border divide-y">
                  {approvalChains.map((c) => (
                    <div key={c.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{c.name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {c.steps.length === 0
                            ? "No approvers"
                            : [...c.steps]
                                .sort((a, b) => a.stepOrder - b.stepOrder)
                                .map((s) => s.approver?.user?.name || s.approver?.user?.email || memberLabel(s.approverId))
                                .join(" → ")}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Badge variant="outline" className={cn("text-[10px]", c.isActive ? "text-brand-600" : "text-muted-foreground")}>
                          {c.isActive ? "Active" : "Inactive"}
                        </Badge>
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => openChainDrawer(c)}>
                          Edit
                        </Button>
                        <Button size="icon" variant="ghost" className="size-7" aria-label={`Delete ${c.name}`} onClick={() => handleDeleteChain(c)}>
                          <Trash2 className="size-3.5 text-muted-foreground" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Section>
        </motion.div>

        <div className="h-px bg-border" />

        {/* Compensation Bands */}
        <motion.div {...anim(0.3)}>
          <Section title="Compensation Bands" description="Define salary ranges by level for benchmarking and offers.">
            <div className="space-y-3">
              <div className="flex justify-end">
                <Button size="sm" variant="outline" onClick={() => setBandDrawer(true)}>
                  <Plus className="mr-1.5 size-3" />
                  Add Band
                </Button>
              </div>
              {compensationBands.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No compensation bands configured</p>
              ) : (
                <div className="rounded-lg border divide-y">
                  {compensationBands.map((band) => (
                    <div key={band.id} className="flex items-center justify-between px-4 py-2.5">
                      <div>
                        <p className="text-sm font-medium">{band.name}</p>
                        <p className="text-xs text-muted-foreground">
                          Level {band.level} · ${(band.minSalary / 100).toLocaleString()} - ${(band.midSalary / 100).toLocaleString()} - ${(band.maxSalary / 100).toLocaleString()}
                        </p>
                      </div>
                      <Button size="icon" variant="ghost" className="size-7" onClick={() => handleDeleteBand(band.id)}>
                        <Trash2 className="size-3.5 text-muted-foreground" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Section>
        </motion.div>

        <div className="h-px bg-border" />

        {/* Self-Service Link */}
        <motion.div {...anim(0.35)}>
          <Section title="Self-Service Portal" description="Employees can view pay stubs, update tax forms, and manage their payroll preferences.">
            <div className="flex items-center gap-3">
              <Button asChild size="sm" variant="outline">
                <Link href="/payroll/self-service">
                  <ExternalLink className="mr-1.5 size-3" />
                  Open Self-Service Portal
                </Link>
              </Button>
            </div>
          </Section>
        </motion.div>
      </div>

      {/* Deduction Drawer */}
      <Sheet open={deductionDrawer} onOpenChange={setDeductionDrawer}>
        <SheetContent className="sm:max-w-lg w-full p-0 flex flex-col">
          <SheetHeader className="px-4 pt-4 pb-3 sm:px-6 sm:pt-6 sm:pb-4 border-b space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-950/40 dark:text-brand-400">
                <DollarSign className="size-5" />
              </div>
              <div>
                <SheetTitle>Add Deduction Type</SheetTitle>
                <SheetDescription>Create a new recurring deduction category.</SheetDescription>
              </div>
            </div>
          </SheetHeader>
          <form onSubmit={(e) => { e.preventDefault(); handleAddDeduction(); }}>
            <div className="flex-1 overflow-y-auto space-y-6 px-4 py-4 sm:px-6 sm:py-5">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input value={newDeduction.name} onChange={(e) => setNewDeduction({ ...newDeduction, name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={newDeduction.category} onValueChange={(v) => setNewDeduction({ ...newDeduction, category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pre_tax">Pre-tax</SelectItem>
                    <SelectItem value="post_tax">Post-tax</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Default Amount ($)</Label>
                  <CurrencyInput prefix="$" value={newDeduction.defaultAmount} onChange={(v) => setNewDeduction({ ...newDeduction, defaultAmount: v })} />
                </div>
                <div className="space-y-2">
                  <Label>Default Percent (%)</Label>
                  <Input type="number" step="0.01" value={newDeduction.defaultPercent} onChange={(e) => setNewDeduction({ ...newDeduction, defaultPercent: e.target.value })} />
                </div>
              </div>
            </div>
            <div className="border-t px-4 py-3 sm:px-6 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setDeductionDrawer(false)}>Cancel</Button>
              <Button type="submit" className="bg-brand-600 hover:bg-brand-700">Create</Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>

      {/* Tax Bracket Drawer */}
      <Sheet open={bracketDrawer} onOpenChange={setBracketDrawer}>
        <SheetContent className="sm:max-w-lg w-full p-0 flex flex-col">
          <SheetHeader className="px-4 pt-4 pb-3 sm:px-6 sm:pt-6 sm:pb-4 border-b space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-950/40 dark:text-brand-400">
                <Shield className="size-5" />
              </div>
              <div>
                <SheetTitle>Add Tax Bracket</SheetTitle>
                <SheetDescription>Define a new progressive tax rate bracket.</SheetDescription>
              </div>
            </div>
          </SheetHeader>
          <form onSubmit={(e) => { e.preventDefault(); handleAddBracket(); }}>
            <div className="flex-1 overflow-y-auto space-y-6 px-4 py-4 sm:px-6 sm:py-5">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input value={newBracket.name} onChange={(e) => setNewBracket({ ...newBracket, name: e.target.value })} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Jurisdiction Level</Label>
                  <Select value={newBracket.jurisdictionLevel} onValueChange={(v) => setNewBracket({ ...newBracket, jurisdictionLevel: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="federal">Federal</SelectItem>
                      <SelectItem value="state">State</SelectItem>
                      <SelectItem value="local">Local</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {newBracket.jurisdictionLevel !== "federal" && (
                  <div className="space-y-2">
                    <Label>{newBracket.jurisdictionLevel === "state" ? "State code" : "Local code"}</Label>
                    <Input
                      value={newBracket.jurisdiction}
                      onChange={(e) => setNewBracket({ ...newBracket, jurisdiction: e.target.value.toUpperCase() })}
                      placeholder={newBracket.jurisdictionLevel === "state" ? "e.g. CA" : "e.g. NYC"}
                    />
                    <p className="text-[11px] text-muted-foreground">Matches the code set in an employee&apos;s tax setup.</p>
                  </div>
                )}
                <div className="space-y-2">
                  <Label>Filing Status</Label>
                  <Select value={newBracket.filingStatus} onValueChange={(v) => setNewBracket({ ...newBracket, filingStatus: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All filing statuses</SelectItem>
                      {Object.entries(FILING_STATUS_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Tax Year</Label>
                  <Input
                    type="number"
                    min="2000"
                    max="2100"
                    value={newBracket.taxYear}
                    onChange={(e) => setNewBracket({ ...newBracket, taxYear: e.target.value })}
                    placeholder="Any year"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Rate (%)</Label>
                  <Input type="number" step="0.01" value={newBracket.rate} onChange={(e) => setNewBracket({ ...newBracket, rate: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Min Income</Label>
                  <CurrencyInput prefix="$" value={newBracket.minIncome} onChange={(v) => setNewBracket({ ...newBracket, minIncome: v })} />
                </div>
                <div className="space-y-2">
                  <Label>Max Income</Label>
                  <CurrencyInput prefix="$" value={newBracket.maxIncome} onChange={(v) => setNewBracket({ ...newBracket, maxIncome: v })} placeholder="Unlimited" />
                </div>
              </div>
            </div>
            <div className="border-t px-4 py-3 sm:px-6 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setBracketDrawer(false)}>Cancel</Button>
              <Button type="submit" className="bg-brand-600 hover:bg-brand-700">Create</Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>

      {/* Shift Drawer */}
      <Sheet open={shiftDrawer} onOpenChange={setShiftDrawer}>
        <SheetContent className="sm:max-w-lg w-full p-0 flex flex-col">
          <SheetHeader className="px-4 pt-4 pb-3 sm:px-6 sm:pt-6 sm:pb-4 border-b space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-950/40 dark:text-brand-400">
                <Clock className="size-5" />
              </div>
              <div>
                <SheetTitle>Add Shift</SheetTitle>
                <SheetDescription>Define a new work shift with optional premium.</SheetDescription>
              </div>
            </div>
          </SheetHeader>
          <form onSubmit={(e) => { e.preventDefault(); handleAddShift(); }}>
            <div className="flex-1 overflow-y-auto space-y-6 px-4 py-4 sm:px-6 sm:py-5">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input value={newShift.name} onChange={(e) => setNewShift({ ...newShift, name: e.target.value })} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select value={newShift.shiftType} onValueChange={(v) => setNewShift({ ...newShift, shiftType: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="regular">Regular</SelectItem>
                      <SelectItem value="overtime">Overtime</SelectItem>
                      <SelectItem value="night">Night</SelectItem>
                      <SelectItem value="weekend">Weekend</SelectItem>
                      <SelectItem value="holiday">Holiday</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Premium (%)</Label>
                  <Input type="number" step="0.1" value={newShift.premiumPercent} onChange={(e) => setNewShift({ ...newShift, premiumPercent: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Start Time</Label>
                  <Input type="time" value={newShift.startTime} onChange={(e) => setNewShift({ ...newShift, startTime: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>End Time</Label>
                  <Input type="time" value={newShift.endTime} onChange={(e) => setNewShift({ ...newShift, endTime: e.target.value })} />
                </div>
              </div>
            </div>
            <div className="border-t px-4 py-3 sm:px-6 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setShiftDrawer(false)}>Cancel</Button>
              <Button type="submit" className="bg-brand-600 hover:bg-brand-700">Create</Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>

      {/* Leave Policy Drawer */}
      <Sheet open={leaveDrawer} onOpenChange={setLeaveDrawer}>
        <SheetContent className="sm:max-w-lg w-full p-0 flex flex-col">
          <SheetHeader className="px-4 pt-4 pb-3 sm:px-6 sm:pt-6 sm:pb-4 border-b space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-950/40 dark:text-brand-400">
                <CalendarDays className="size-5" />
              </div>
              <div>
                <SheetTitle>Add Leave Policy</SheetTitle>
                <SheetDescription>Set up how staff earn paid time off (PTO).</SheetDescription>
              </div>
            </div>
          </SheetHeader>
          <form onSubmit={(e) => { e.preventDefault(); handleAddLeavePolicy(); }}>
            <div className="flex-1 overflow-y-auto space-y-6 px-4 py-4 sm:px-6 sm:py-5">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input value={newLeave.name} onChange={(e) => setNewLeave({ ...newLeave, name: e.target.value })} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Leave Type</Label>
                  <Select value={newLeave.leaveType} onValueChange={(v) => setNewLeave({ ...newLeave, leaveType: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="vacation">Vacation</SelectItem>
                      <SelectItem value="sick">Sick</SelectItem>
                      <SelectItem value="personal">Personal</SelectItem>
                      <SelectItem value="parental">Parental</SelectItem>
                      <SelectItem value="bereavement">Bereavement</SelectItem>
                      <SelectItem value="unpaid">Unpaid</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>How time off builds up</Label>
                  <Select value={newLeave.accrualMethod} onValueChange={(v) => setNewLeave({ ...newLeave, accrualMethod: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="per_pay_period">Per Pay Period</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="annually">Annually</SelectItem>
                      <SelectItem value="front_loaded">Front Loaded</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-[12px] text-muted-foreground sm:col-span-2">
                  {ACCRUAL_HELP[newLeave.accrualMethod]}
                </p>
                <div className="space-y-2">
                  <Label>Hours earned</Label>
                  <Input type="number" step="0.5" value={newLeave.accrualRate} onChange={(e) => setNewLeave({ ...newLeave, accrualRate: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Max Balance (hours)</Label>
                  <Input type="number" value={newLeave.maxBalance} onChange={(e) => setNewLeave({ ...newLeave, maxBalance: e.target.value })} placeholder="Unlimited" />
                </div>
                <div className="space-y-2">
                  <Label>Carry over to next year (hours)</Label>
                  <Input type="number" value={newLeave.carryOverMax} onChange={(e) => setNewLeave({ ...newLeave, carryOverMax: e.target.value })} placeholder="No limit" />
                </div>
              </div>
              <p className="text-[12px] text-muted-foreground">
                Balance = hours carried over from last year + hours earned this year − approved leave, capped at the max balance. Balances update whenever they&apos;re viewed.
              </p>
            </div>
            <div className="border-t px-4 py-3 sm:px-6 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setLeaveDrawer(false)}>Cancel</Button>
              <Button type="submit" className="bg-brand-600 hover:bg-brand-700">Create</Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>

      {/* Approval Chain Drawer */}
      <Sheet open={chainDrawer} onOpenChange={setChainDrawer}>
        <SheetContent className="sm:max-w-lg w-full p-0 flex flex-col">
          <SheetHeader className="px-4 pt-4 pb-3 sm:px-6 sm:pt-6 sm:pb-4 border-b space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-950/40 dark:text-brand-400">
                <ListOrdered className="size-5" />
              </div>
              <div>
                <SheetTitle>{chainForm.id ? "Edit Approval Chain" : "Add Approval Chain"}</SheetTitle>
                <SheetDescription>Pay runs sent for sign-off go to these approvers, one after another.</SheetDescription>
              </div>
            </div>
          </SheetHeader>
          <form onSubmit={(e) => { e.preventDefault(); handleSaveChain(); }}>
            <div className="flex-1 overflow-y-auto space-y-6 px-4 py-4 sm:px-6 sm:py-5">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input value={chainForm.name} onChange={(e) => setChainForm({ ...chainForm, name: e.target.value })} placeholder="e.g. Finance sign-off" />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Input value={chainForm.description} onChange={(e) => setChainForm({ ...chainForm, description: e.target.value })} placeholder="Optional" />
              </div>
              <div className="flex items-start gap-3">
                <Switch
                  id="chain-active"
                  checked={chainForm.isActive}
                  onCheckedChange={(v: boolean) => setChainForm({ ...chainForm, isActive: v })}
                />
                <div className="space-y-0.5">
                  <Label htmlFor="chain-active">Active</Label>
                  <p className="text-[12px] text-muted-foreground">Only active chains are used for sign-off.</p>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Approvers, in order</Label>
                {chainForm.approverIds.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No approvers yet.</p>
                ) : (
                  <div className="rounded-lg border divide-y">
                    {chainForm.approverIds.map((memberId, i) => (
                      <div key={memberId} className="flex items-center justify-between gap-2 px-3 py-2">
                        <p className="text-sm min-w-0 truncate">
                          <span className="mr-2 font-mono text-xs text-muted-foreground">{i + 1}.</span>
                          {memberLabel(memberId)}
                        </p>
                        <div className="flex shrink-0 items-center">
                          <Button type="button" size="icon" variant="ghost" className="size-7" aria-label="Move up" disabled={i === 0} onClick={() => moveApprover(i, -1)}>
                            <ArrowUp className="size-3.5" />
                          </Button>
                          <Button type="button" size="icon" variant="ghost" className="size-7" aria-label="Move down" disabled={i === chainForm.approverIds.length - 1} onClick={() => moveApprover(i, 1)}>
                            <ArrowDown className="size-3.5" />
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="size-7"
                            aria-label="Remove approver"
                            onClick={() => setChainForm({ ...chainForm, approverIds: chainForm.approverIds.filter((x) => x !== memberId) })}
                          >
                            <Trash2 className="size-3.5 text-muted-foreground" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {members.some((m) => !chainForm.approverIds.includes(m.id)) && (
                  <Select
                    value=""
                    onValueChange={(v) => setChainForm({ ...chainForm, approverIds: [...chainForm.approverIds, v] })}
                  >
                    <SelectTrigger><SelectValue placeholder="Add an approver" /></SelectTrigger>
                    <SelectContent>
                      {members
                        .filter((m) => !chainForm.approverIds.includes(m.id))
                        .map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            {m.userName ? `${m.userName} (${m.userEmail})` : m.userEmail}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                )}
                <p className="text-[12px] text-muted-foreground">Approvers must be workspace members who can approve payroll.</p>
              </div>
            </div>
            <div className="border-t px-4 py-3 sm:px-6 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setChainDrawer(false)}>Cancel</Button>
              <Button type="submit" disabled={chainSaving || !chainForm.name.trim()} className="bg-brand-600 hover:bg-brand-700">
                {chainSaving ? "Saving..." : chainForm.id ? "Save" : "Create"}
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>

      {/* Compensation Band Drawer */}
      <Sheet open={bandDrawer} onOpenChange={setBandDrawer}>
        <SheetContent className="sm:max-w-lg w-full p-0 flex flex-col">
          <SheetHeader className="px-4 pt-4 pb-3 sm:px-6 sm:pt-6 sm:pb-4 border-b space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-950/40 dark:text-brand-400">
                <Layers className="size-5" />
              </div>
              <div>
                <SheetTitle>Add Compensation Band</SheetTitle>
                <SheetDescription>Define a salary range for a specific level.</SheetDescription>
              </div>
            </div>
          </SheetHeader>
          <form onSubmit={(e) => { e.preventDefault(); handleAddBand(); }}>
            <div className="flex-1 overflow-y-auto space-y-6 px-4 py-4 sm:px-6 sm:py-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input value={newBand.name} onChange={(e) => setNewBand({ ...newBand, name: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Level</Label>
                  <Input value={newBand.level} onChange={(e) => setNewBand({ ...newBand, level: e.target.value })} placeholder="e.g. L3, Senior" />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label>Min Salary</Label>
                  <CurrencyInput prefix="$" value={newBand.minSalary} onChange={(v) => setNewBand({ ...newBand, minSalary: v })} />
                </div>
                <div className="space-y-2">
                  <Label>Mid Salary</Label>
                  <CurrencyInput prefix="$" value={newBand.midSalary} onChange={(v) => setNewBand({ ...newBand, midSalary: v })} />
                </div>
                <div className="space-y-2">
                  <Label>Max Salary</Label>
                  <CurrencyInput prefix="$" value={newBand.maxSalary} onChange={(v) => setNewBand({ ...newBand, maxSalary: v })} />
                </div>
              </div>
            </div>
            <div className="border-t px-4 py-3 sm:px-6 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setBandDrawer(false)}>Cancel</Button>
              <Button type="submit" className="bg-brand-600 hover:bg-brand-700">Create</Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
      {confirmDialog}
    </ContentReveal>
  );
}
