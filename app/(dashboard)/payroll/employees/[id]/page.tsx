"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "motion/react";
import { toast } from "sonner";
import Link from "next/link";
import { ArrowLeft, Save, Trash2, Users, Power, PowerOff, Plus } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Section } from "@/components/dashboard/section";
import { Badge } from "@/components/ui/badge";
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
import { ContentReveal } from "@/components/ui/content-reveal";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { formatMoney } from "@/lib/money";
import { useConfirm } from "@/lib/hooks/use-confirm";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";
import { CurrencySelect } from "@/components/ui/currency-select";
import { cn } from "@/lib/utils";
import { useApi, useApiCache } from "@/lib/query/use-api";
import { standardPeriodHours } from "@/lib/payroll/overtime";

interface EmployeeDetail {
  id: string;
  name: string;
  email: string | null;
  employeeNumber: string;
  position: string | null;
  salary: number;
  payFrequency: string;
  taxRate: number;
  bankAccountNumber: string | null;
  startDate: string;
  endDate: string | null;
  isActive: boolean;
  compensationType: string;
  hourlyRate: number | null;
  memberId: string | null;
  member: { user: { name: string | null; email: string } } | null;
  department: string | null;
  ptoBalanceHours: number | null;
  currency: string | null;
  compensationBandId: string | null;
}

interface DeductionTypeOption {
  id: string;
  name: string;
  category: string; // pre_tax | post_tax
  defaultAmount: number | null; // cents
  defaultPercent: number | null;
  isActive: boolean;
}

interface EmployeeDeduction {
  id: string;
  deductionTypeId: string;
  deductionType: DeductionTypeOption;
  timing: string; // recurring | one_time
  amount: number | null; // cents
  percent: number | null;
  startDate: string | null;
  endDate: string | null;
  isActive: boolean;
}

interface TaxConfig {
  id: string;
  filingStatus: string;
  federalAllowances: number;
  stateAllowances: number;
  additionalWithholding: number | null; // cents per period, federal
  additionalStateWithholding: number; // cents per period
  stateCode: string | null;
  localCode: string | null;
  exempt: boolean;
}

interface LeaveBalance {
  id: string;
  balance: number;
  usedHours: number;
  policy: { name: string; leaveType: string } | null;
}

interface CompensationBand {
  id: string;
  name: string;
  level: string | null;
  minSalary: number; // annual cents
  midSalary: number;
  maxSalary: number;
  currency: string | null;
  isActive: boolean;
}

interface EmployeeForm {
  name: string;
  email: string;
  employeeNumber: string;
  position: string;
  salary: string;
  payFrequency: string;
  taxRate: string;
  bankAccountNumber: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  compensationType: string;
  hourlyRate: string;
  currency: string;
  memberId: string;
  department: string;
  compensationBandId: string;
}

function toEmployeeForm(e: EmployeeDetail | null): EmployeeForm {
  if (!e) {
    return { name: "", email: "", employeeNumber: "", position: "", salary: "", payFrequency: "monthly", taxRate: "", bankAccountNumber: "", startDate: "", endDate: "", isActive: true, compensationType: "salary", hourlyRate: "", currency: "USD", memberId: "none", department: "", compensationBandId: "none" };
  }
  return {
    name: e.name,
    email: e.email || "",
    employeeNumber: e.employeeNumber,
    position: e.position || "",
    salary: (e.salary / 100).toFixed(2),
    payFrequency: e.payFrequency,
    taxRate: (e.taxRate / 100).toFixed(2),
    bankAccountNumber: e.bankAccountNumber || "",
    startDate: e.startDate || "",
    endDate: e.endDate || "",
    isActive: e.isActive,
    compensationType: e.compensationType || "salary",
    hourlyRate: e.hourlyRate ? (e.hourlyRate / 100).toFixed(2) : "",
    currency: e.currency || "USD",
    memberId: e.memberId ?? "none",
    department: e.department || "",
    compensationBandId: e.compensationBandId ?? "none",
  };
}

interface TaxConfigForm {
  tcFilingStatus: string;
  tcFederalAllowances: string;
  tcStateAllowances: string;
  tcAddlFederal: string; // dollars
  tcAddlState: string; // dollars
  tcStateCode: string;
  tcLocalCode: string;
  tcExempt: boolean;
}

function toTaxConfigForm(tc: TaxConfig | null): TaxConfigForm {
  return {
    tcFilingStatus: tc?.filingStatus || "single",
    tcFederalAllowances: String(tc?.federalAllowances ?? 0),
    tcStateAllowances: String(tc?.stateAllowances ?? 0),
    tcAddlFederal: ((tc?.additionalWithholding ?? 0) / 100).toFixed(2),
    tcAddlState: ((tc?.additionalStateWithholding ?? 0) / 100).toFixed(2),
    tcStateCode: tc?.stateCode || "",
    tcLocalCode: tc?.localCode || "",
    tcExempt: tc?.exempt ?? false,
  };
}

/** Dollars typed in a money field → integer cents (blank or invalid → 0). */
function toCents(value: string): number {
  const n = parseFloat(value);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

interface DeductionForm {
  deductionTypeId: string;
  basis: "amount" | "percent";
  amount: string; // dollars
  percent: string;
  timing: string;
  startDate: string;
  endDate: string;
}

const EMPTY_DEDUCTION_FORM: DeductionForm = { deductionTypeId: "", basis: "amount", amount: "", percent: "", timing: "recurring", startDate: "", endDate: "" };

const anim = (delay: number) => ({
  initial: { opacity: 0, y: 12 } as const,
  animate: { opacity: 1, y: 0 } as const,
  transition: { duration: 0.3, delay } as const,
});

/** Pay for one period: hourly rate × standard hours for hourly staff, salary spread over the year otherwise. */
function getPerPeriodPay(salary: number, frequency: string, compensationType: string, hourlyRate: number): number {
  if (compensationType === "hourly") return Math.round(hourlyRate * standardPeriodHours(frequency));
  switch (frequency) {
    case "weekly": return Math.round(salary / 52);
    case "biweekly": return Math.round(salary / 26);
    case "monthly": return Math.round(salary / 12);
    default: return Math.round(salary / 12);
  }
}

export default function EmployeeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const { confirm, dialog: confirmDialog } = useConfirm();
  const cache = useApiCache();

  const employeeUrl = `/api/v1/payroll/employees/${id}`;
  const taxConfigUrl = `/api/v1/payroll/employees/${id}/tax-config`;
  const { data: employeeData, loading } = useApi<{ employee?: EmployeeDetail }>(employeeUrl);
  const emp = employeeData?.employee ?? null;

  // New section state
  const { data: deductionsData } = useApi<{ data?: EmployeeDeduction[] }>(`/api/v1/payroll/employees/${id}/deductions`);
  const { data: deductionTypesData } = useApi<{ data?: DeductionTypeOption[] }>("/api/v1/payroll/deductions/types");
  const { data: taxConfigData } = useApi<{ taxConfig?: TaxConfig | null }>(taxConfigUrl);
  const { data: leaveBalancesData } = useApi<{ data?: LeaveBalance[] }>(`/api/v1/payroll/employees/${id}/leave-balances`);
  // Fetch compensation band when employee loads
  const { data: bandData } = useApi<{ band?: CompensationBand }>(emp?.compensationBandId ? `/api/v1/payroll/compensation/bands/${emp.compensationBandId}` : null);
  const { data: bandsData } = useApi<{ data?: CompensationBand[] }>("/api/v1/payroll/compensation/bands");
  const { data: membersData } = useApi<{ members?: { id: string; userName: string | null; userEmail: string }[] }>("/api/v1/members");
  const deductions = deductionsData?.data ?? [];
  const deductionTypes = (deductionTypesData?.data ?? []).filter((t) => t.isActive);
  const taxConfig = taxConfigData?.taxConfig ?? null;
  const leaveBalances = leaveBalancesData?.data ?? [];
  const compensationBand = bandData?.band ?? null;
  const bands = bandsData?.data ?? [];
  const members = membersData?.members ?? [];
  const [taxSaving, setTaxSaving] = useState(false);

  // Add-deduction form
  const [deductionForm, setDeductionForm] = useState<DeductionForm>(EMPTY_DEDUCTION_FORM);
  const [addingDeduction, setAddingDeduction] = useState(false);
  const [showDeductionForm, setShowDeductionForm] = useState(false);

  // Tax config form state (seeded from the saved config until edited)
  const [tcDraft, setTcDraft] = useState<TaxConfigForm | null>(null);
  const tcForm = tcDraft ?? toTaxConfigForm(taxConfig);
  const setTcField = <K extends keyof TaxConfigForm>(key: K) => (value: TaxConfigForm[K]) =>
    setTcDraft((d) => ({ ...(d ?? toTaxConfigForm(taxConfig)), [key]: value }));
  const { tcFilingStatus, tcFederalAllowances, tcStateAllowances, tcAddlFederal, tcAddlState, tcStateCode, tcLocalCode, tcExempt } = tcForm;
  const setTcFilingStatus = setTcField("tcFilingStatus");
  const setTcFederalAllowances = setTcField("tcFederalAllowances");
  const setTcStateAllowances = setTcField("tcStateAllowances");
  const setTcAddlFederal = setTcField("tcAddlFederal");
  const setTcAddlState = setTcField("tcAddlState");
  const setTcStateCode = setTcField("tcStateCode");
  const setTcLocalCode = setTcField("tcLocalCode");
  const setTcExempt = setTcField("tcExempt");

  // Edit form state (seeded from the employee until edited)
  const [draft, setDraft] = useState<EmployeeForm | null>(null);
  const form = draft ?? toEmployeeForm(emp);
  const setField = <K extends keyof EmployeeForm>(key: K) => (value: EmployeeForm[K]) =>
    setDraft((d) => ({ ...(d ?? toEmployeeForm(emp)), [key]: value }));
  const { name, email, employeeNumber, position, salary, payFrequency, taxRate, bankAccountNumber, startDate, endDate, isActive, compensationType, hourlyRate, currency, memberId, department, compensationBandId } = form;
  const setName = setField("name");
  const setEmail = setField("email");
  const setEmployeeNumber = setField("employeeNumber");
  const setPosition = setField("position");
  const setSalary = setField("salary");
  const setPayFrequency = setField("payFrequency");
  const setTaxRate = setField("taxRate");
  const setBankAccountNumber = setField("bankAccountNumber");
  const setStartDate = setField("startDate");
  const setEndDate = setField("endDate");
  const setIsActive = setField("isActive");
  const setCompensationType = setField("compensationType");
  const setHourlyRate = setField("hourlyRate");
  const setCurrency = setField("currency");
  const setMemberId = setField("memberId");
  const setDepartment = setField("department");
  const setCompensationBandId = setField("compensationBandId");
  useDocumentTitle("Payroll · Employee Details");

  const orgId =
    typeof window !== "undefined"
      ? localStorage.getItem("activeOrgId")
      : null;

  async function handleSaveTaxConfig() {
    if (!orgId) return;
    setTaxSaving(true);
    try {
      const res = await fetch(`/api/v1/payroll/employees/${id}/tax-config`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-organization-id": orgId,
        },
        body: JSON.stringify({
          filingStatus: tcFilingStatus,
          federalAllowances: parseInt(tcFederalAllowances) || 0,
          stateAllowances: parseInt(tcStateAllowances) || 0,
          additionalWithholding: toCents(tcAddlFederal),
          additionalStateWithholding: toCents(tcAddlState),
          stateCode: tcStateCode.trim() || null,
          localCode: tcLocalCode.trim() || null,
          exempt: tcExempt,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.taxConfig) {
          cache.set(taxConfigUrl, { taxConfig: data.taxConfig });
          setTcDraft(null);
        }
        toast.success("Tax configuration updated");
      } else {
        const data = await res.json();
        toast.error(typeof data.error === "string" ? data.error : "Failed to update tax config");
      }
    } catch {
      toast.error("Failed to update tax configuration");
    } finally {
      setTaxSaving(false);
    }
  }

  async function handleSave() {
    if (!orgId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/v1/payroll/employees/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-organization-id": orgId,
        },
        body: JSON.stringify({
          name,
          email: email || null,
          position: position || null,
          salary: Math.round(parseFloat(salary) * 100),
          payFrequency,
          taxRate: Math.round(parseFloat(taxRate) * 100),
          bankAccountNumber: bankAccountNumber || null,
          isActive,
          compensationType,
          hourlyRate: hourlyRate ? Math.round(parseFloat(hourlyRate) * 100) : null,
          currency,
          memberId: memberId === "none" ? null : memberId,
          department: department.trim() || null,
          compensationBandId: compensationBandId === "none" ? null : compensationBandId,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.employee) {
          cache.set(employeeUrl, { employee: data.employee });
          setDraft(null);
        }
        toast.success("Employee updated");
      } else {
        const data = await res.json();
        toast.error(typeof data.error === "string" ? data.error : "Failed to update");
      }
    } catch {
      toast.error("Failed to update employee");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!orgId) return;
    const confirmed = await confirm({
      title: "Delete this employee?",
      description: "They'll be removed from payroll and won't be included in new pay runs. Past pay runs and payslips keep their record.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!confirmed) return;
    const res = await fetch(`/api/v1/payroll/employees/${id}`, {
      method: "DELETE",
      headers: { "x-organization-id": orgId },
    });
    if (res.ok) {
      toast.success("Employee deleted");
      router.push("/payroll/employees");
    } else {
      toast.error("Failed to delete employee");
    }
  }

  async function handleAddDeduction() {
    if (!orgId || !deductionForm.deductionTypeId) return;
    setAddingDeduction(true);
    try {
      // Blank amount and percent → the deduction type's default applies.
      const amount = deductionForm.basis === "amount" && deductionForm.amount ? toCents(deductionForm.amount) : undefined;
      const percent = deductionForm.basis === "percent" && deductionForm.percent ? parseFloat(deductionForm.percent) : undefined;
      const res = await fetch(`/api/v1/payroll/employees/${id}/deductions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify({
          deductionTypeId: deductionForm.deductionTypeId,
          timing: deductionForm.timing,
          amount,
          percent: percent != null && Number.isFinite(percent) ? percent : undefined,
          startDate: deductionForm.startDate || undefined,
          endDate: deductionForm.endDate || undefined,
        }),
      });
      if (res.ok) {
        toast.success("Deduction added");
        setDeductionForm(EMPTY_DEDUCTION_FORM);
        setShowDeductionForm(false);
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(typeof data.error === "string" ? data.error : "Failed to add deduction");
      }
    } catch {
      toast.error("Failed to add deduction");
    } finally {
      setAddingDeduction(false);
    }
  }

  async function handleRemoveDeduction(d: EmployeeDeduction) {
    if (!orgId) return;
    const confirmed = await confirm({
      title: "Remove this deduction?",
      description: `${d.deductionType.name} won't be taken from future pay runs. Past pay runs keep it.`,
      confirmLabel: "Remove",
      destructive: true,
    });
    if (!confirmed) return;
    const res = await fetch(`/api/v1/payroll/employees/${id}/deductions/${d.id}`, {
      method: "DELETE",
      headers: { "x-organization-id": orgId },
    });
    if (res.ok) toast.success("Deduction removed");
    else toast.error("Failed to remove deduction");
  }

  if (loading) return <BrandLoader />;

  if (!emp) {
    return (
      <ContentReveal>
        <button
          onClick={() => router.push("/payroll/employees")}
          className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeft className="size-3.5" />
          Back to employees
        </button>
        <p className="text-sm text-muted-foreground">Employee not found</p>
      </ContentReveal>
    );
  }

  const salaryInCents = Math.round(parseFloat(salary || "0") * 100);
  const hourlyRateInCents = Math.round(parseFloat(hourlyRate || "0") * 100);
  const taxRateNum = parseFloat(taxRate || "0");
  // The band picked in the form (falls back to the saved band while the list loads)
  const selectedBand =
    compensationBandId === "none"
      ? null
      : bands.find((b) => b.id === compensationBandId) ??
        (compensationBand?.id === compensationBandId ? compensationBand : null);
  const selectedDeductionType = deductionTypes.find((t) => t.id === deductionForm.deductionTypeId) ?? null;

  return (
    <ContentReveal className="space-y-6">
      {/* Back link */}
      <button
        onClick={() => router.push("/payroll/employees")}
        className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="size-3.5" />
        Back to employees
      </button>

      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className={cn(
            "flex size-10 items-center justify-center rounded-xl",
            isActive
              ? "bg-brand-50 dark:bg-brand-950/40"
              : "bg-muted"
          )}>
            <Users className={cn(
              "size-5",
              isActive
                ? "text-brand-600 dark:text-brand-400"
                : "text-muted-foreground"
            )} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold">{emp.name}</h1>
              <Badge variant="outline" className={
                isActive
                  ? "border-brand-200 bg-brand-50 text-brand-700 dark:border-brand-800 dark:bg-brand-950 dark:text-brand-300"
                  : ""
              }>
                {isActive ? "Active" : "Inactive"}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {emp.employeeNumber}{emp.position ? ` · ${emp.position}` : ""}
            </p>
            {emp.member && (
              <p className="text-xs text-muted-foreground">
                Linked to {emp.member.user.name || emp.member.user.email}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setIsActive(!isActive)}>
            {isActive ? (
              <><PowerOff className="mr-1.5 size-3.5" />Deactivate</>
            ) : (
              <><Power className="mr-1.5 size-3.5" />Activate</>
            )}
          </Button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <motion.div {...anim(0)} className="rounded-xl border bg-card p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {compensationType === "salary" ? "Annual Salary" : compensationType === "hourly" ? "Hourly Rate" : "Compensation"}
          </p>
          <p className="mt-1 text-2xl font-bold font-mono tabular-nums truncate">
            {compensationType === "salary"
              ? formatMoney(salaryInCents)
              : compensationType === "hourly"
                ? formatMoney(hourlyRateInCents)
                : "-"}
          </p>
        </motion.div>
        <motion.div {...anim(0.05)} className="rounded-xl border bg-card p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Per-Period Pay</p>
          <p className="mt-1 text-2xl font-bold font-mono tabular-nums truncate">{formatMoney(getPerPeriodPay(salaryInCents, payFrequency, compensationType, hourlyRateInCents))}</p>
          {compensationType === "hourly" && (
            <p className="mt-0.5 text-[11px] text-muted-foreground">At {standardPeriodHours(payFrequency)} standard hours</p>
          )}
        </motion.div>
        <motion.div {...anim(0.09)} className="rounded-xl border bg-card p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Tax Rate</p>
          <p className="mt-1 text-2xl font-bold font-mono tabular-nums truncate">{taxRateNum}%</p>
        </motion.div>
        <motion.div {...anim(0.12)} className="rounded-xl border bg-card p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Compensation Type</p>
          <p className="mt-1 text-2xl font-bold font-mono tabular-nums truncate">{compensationType.charAt(0).toUpperCase() + compensationType.slice(1)}</p>
        </motion.div>
      </div>

      {/* Edit form */}
      <div className="max-w-4xl space-y-6">
        {/* Personal Info */}
        <Section title="Personal Info" description="Basic employee information.">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Full Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Email</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Employee #</Label>
              <Input
                value={employeeNumber}
                onChange={(e) => setEmployeeNumber(e.target.value)}
                disabled
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Position</Label>
              <Input
                value={position}
                onChange={(e) => setPosition(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Department</Label>
              <Input
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                placeholder="e.g. Engineering"
              />
            </div>
          </div>
        </Section>

        <div className="h-px bg-border" />

        {/* Compensation */}
        <Section title="Compensation" description="Salary, pay frequency, and tax configuration.">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Compensation Type</Label>
              <Select value={compensationType} onValueChange={setCompensationType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="salary">Salary</SelectItem>
                  <SelectItem value="hourly">Hourly</SelectItem>
                  <SelectItem value="milestone">Milestone</SelectItem>
                  <SelectItem value="commission">Commission</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Annual Salary</Label>
              <CurrencyInput
                prefix="$"
                value={salary}
                onChange={setSalary}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Pay Frequency</Label>
              <Select value={payFrequency} onValueChange={setPayFrequency}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="biweekly">Biweekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Tax Rate (%)</Label>
              <Input
                type="number"
                step="0.01"
                value={taxRate}
                onChange={(e) => setTaxRate(e.target.value)}
              />
            </div>
            {compensationType === "hourly" && (
              <div className="space-y-1.5">
                <Label className="text-xs">Hourly Rate</Label>
                <CurrencyInput prefix="$" value={hourlyRate} onChange={setHourlyRate} />
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs">Currency</Label>
              <CurrencySelect value={currency} onValueChange={setCurrency} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs">Pay band</Label>
              <Select value={compensationBandId} onValueChange={setCompensationBandId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No pay band</SelectItem>
                  {bands.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.level ? `${b.name} (${b.level})` : b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[12px] text-muted-foreground">
                {selectedBand
                  ? `Range ${formatMoney(selectedBand.minSalary, selectedBand.currency || "USD")} to ${formatMoney(selectedBand.maxSalary, selectedBand.currency || "USD")} a year, midpoint ${formatMoney(selectedBand.midSalary, selectedBand.currency || "USD")}.`
                  : "Pick a salary band from Compensation to compare this pay against its range."}
              </p>
            </div>
          </div>
        </Section>

        <div className="h-px bg-border" />

        {/* Details */}
        <Section title="Details" description="Banking, employment dates and self-service access.">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5 sm:col-span-3">
              <Label className="text-xs">Self-service login</Label>
              <Select value={memberId} onValueChange={setMemberId}>
                <SelectTrigger className="sm:max-w-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not linked</SelectItem>
                  {members.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.userName ? `${m.userName} (${m.userEmail})` : m.userEmail}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[12px] text-muted-foreground">
                The workspace member who is this employee. Once linked, they can see their payslips, leave and timesheets in Employee self-service.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Bank Account Number</Label>
              <Input
                value={bankAccountNumber}
                onChange={(e) => setBankAccountNumber(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Start Date</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                disabled
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">End Date</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                disabled
              />
            </div>
          </div>
        </Section>

        <div className="h-px bg-border" />

        {/* Deductions */}
        <Section title="Deductions" description="Amounts taken from this employee's pay each pay run, such as pension or benefits. Manage deduction types in settings.">
          <div className="space-y-3">
            {deductions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No deductions assigned.</p>
            ) : (
              <div className="space-y-2">
                {deductions.map((d) => {
                  // Same order as the pay run: own amount, own percent, type's default amount, type's default percent
                  const amt = d.amount ?? (d.percent == null ? d.deductionType.defaultAmount : null);
                  const pct = amt == null ? (d.percent ?? d.deductionType.defaultPercent) : null;
                  const preTax = d.deductionType.category === "pre_tax";
                  return (
                    <div
                      key={d.id}
                      className="flex items-center justify-between gap-3 rounded-md border px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{d.deductionType.name}</p>
                        <div className="flex flex-wrap items-center gap-2 mt-0.5">
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[11px]",
                              preTax
                                ? "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300"
                                : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300"
                            )}
                          >
                            {preTax ? "Pre-tax" : "Post-tax"}
                          </Badge>
                          <Badge variant="outline" className="text-[11px]">
                            {d.timing === "one_time" ? "One-time" : "Recurring"}
                          </Badge>
                          {(d.startDate || d.endDate) && (
                            <span className="text-[11px] text-muted-foreground">
                              {d.startDate ? `From ${d.startDate}` : ""}{d.startDate && d.endDate ? " " : ""}{d.endDate ? `until ${d.endDate}` : ""}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-mono tabular-nums">
                          {pct != null ? `${pct}% of gross` : amt != null ? formatMoney(amt, currency) : "-"}
                        </span>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[11px]",
                            d.isActive
                              ? "border-brand-200 bg-brand-50 text-brand-700 dark:border-brand-800 dark:bg-brand-950 dark:text-brand-300"
                              : ""
                          )}
                        >
                          {d.isActive ? "Active" : "Inactive"}
                        </Badge>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-7"
                          aria-label={`Remove ${d.deductionType.name}`}
                          onClick={() => handleRemoveDeduction(d)}
                        >
                          <Trash2 className="size-3.5 text-muted-foreground" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {!showDeductionForm ? (
              <Button size="sm" variant="outline" onClick={() => setShowDeductionForm(true)}>
                <Plus className="mr-1.5 size-3" />
                Add deduction
              </Button>
            ) : deductionTypes.length === 0 ? (
              <div className="rounded-md border border-dashed px-4 py-3 text-sm text-muted-foreground">
                No deduction types yet. Add one in{" "}
                <Link href="/payroll/settings" className="underline underline-offset-2 hover:text-foreground">
                  Payroll settings
                </Link>{" "}
                first.
              </div>
            ) : (
              <form
                className="space-y-4 rounded-md border px-4 py-4"
                onSubmit={(e) => { e.preventDefault(); handleAddDeduction(); }}
              >
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Deduction type</Label>
                    <Select
                      value={deductionForm.deductionTypeId}
                      onValueChange={(v) => setDeductionForm({ ...deductionForm, deductionTypeId: v })}
                    >
                      <SelectTrigger><SelectValue placeholder="Choose a type" /></SelectTrigger>
                      <SelectContent>
                        {deductionTypes.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.name} ({t.category === "pre_tax" ? "Pre-tax" : "Post-tax"})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Calculate as</Label>
                    <Select
                      value={deductionForm.basis}
                      onValueChange={(v) => setDeductionForm({ ...deductionForm, basis: v as DeductionForm["basis"] })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="amount">Fixed amount</SelectItem>
                        <SelectItem value="percent">Percent of gross pay</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {deductionForm.basis === "amount" ? (
                    <div className="space-y-1.5">
                      <Label className="text-xs">Amount per pay run</Label>
                      <CurrencyInput
                        prefix="$"
                        value={deductionForm.amount}
                        onChange={(v) => setDeductionForm({ ...deductionForm, amount: v })}
                        placeholder={selectedDeductionType?.defaultAmount != null ? (selectedDeductionType.defaultAmount / 100).toFixed(2) : "0.00"}
                      />
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <Label className="text-xs">Percent (%)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        value={deductionForm.percent}
                        onChange={(e) => setDeductionForm({ ...deductionForm, percent: e.target.value })}
                        placeholder={selectedDeductionType?.defaultPercent != null ? String(selectedDeductionType.defaultPercent) : "0"}
                      />
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <Label className="text-xs">How often</Label>
                    <Select
                      value={deductionForm.timing}
                      onValueChange={(v) => setDeductionForm({ ...deductionForm, timing: v })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="recurring">Recurring</SelectItem>
                        <SelectItem value="one_time">One-time</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Start date (optional)</Label>
                    <Input
                      type="date"
                      value={deductionForm.startDate}
                      onChange={(e) => setDeductionForm({ ...deductionForm, startDate: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">End date (optional)</Label>
                    <Input
                      type="date"
                      value={deductionForm.endDate}
                      onChange={(e) => setDeductionForm({ ...deductionForm, endDate: e.target.value })}
                    />
                  </div>
                </div>
                <p className="text-[12px] text-muted-foreground">
                  Leave the amount blank to use the deduction type&apos;s default. The deduction applies to every pay run between the start and end dates. A one-time deduction is taken in the next finished pay run, then switches off.
                </p>
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => { setShowDeductionForm(false); setDeductionForm(EMPTY_DEDUCTION_FORM); }}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={addingDeduction || !deductionForm.deductionTypeId}
                    className="bg-brand-600 hover:bg-brand-700"
                  >
                    {addingDeduction ? "Adding..." : "Add deduction"}
                  </Button>
                </div>
              </form>
            )}
          </div>
        </Section>

        <div className="h-px bg-border" />

        {/* Tax Configuration */}
        <Section title="Tax Configuration" description="Federal and state tax withholding settings.">
          {!taxConfig ? (
            <p className="text-sm text-muted-foreground">No tax configuration found.</p>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Filing Status</Label>
                  <Select value={tcFilingStatus} onValueChange={setTcFilingStatus}>
                    <SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="single">Single</SelectItem>
                      <SelectItem value="married_joint">Married Filing Jointly</SelectItem>
                      <SelectItem value="married_separate">Married Filing Separately</SelectItem>
                      <SelectItem value="head_of_household">Head of Household</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">State code</Label>
                  <Input
                    value={tcStateCode}
                    onChange={(e) => setTcStateCode(e.target.value.toUpperCase())}
                    placeholder="e.g. CA"
                    maxLength={10}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Local code</Label>
                  <Input
                    value={tcLocalCode}
                    onChange={(e) => setTcLocalCode(e.target.value.toUpperCase())}
                    placeholder="e.g. NYC"
                    maxLength={20}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Federal Allowances</Label>
                  <Input
                    type="number"
                    value={tcFederalAllowances}
                    onChange={(e) => setTcFederalAllowances(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">State Allowances</Label>
                  <Input
                    type="number"
                    value={tcStateAllowances}
                    onChange={(e) => setTcStateAllowances(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Extra federal withholding</Label>
                  <CurrencyInput
                    prefix="$"
                    value={tcAddlFederal}
                    onChange={setTcAddlFederal}
                  />
                  <p className="text-[11px] text-muted-foreground">Withheld on top of the calculated amount, each pay run.</p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Extra state withholding</Label>
                  <CurrencyInput
                    prefix="$"
                    value={tcAddlState}
                    onChange={setTcAddlState}
                  />
                  <p className="text-[11px] text-muted-foreground">Withheld on top of the calculated amount, each pay run.</p>
                </div>
              </div>
              <p className="text-[12px] text-muted-foreground">
                State and local codes pick which tax brackets apply. They must match the jurisdiction code on brackets in Payroll settings.
              </p>
              <div className="flex items-start gap-3">
                <Switch id="tc-exempt" checked={tcExempt} onCheckedChange={(v: boolean) => setTcExempt(v)} />
                <div className="space-y-0.5">
                  <Label htmlFor="tc-exempt" className="text-xs">Exempt from income tax</Label>
                  <p className="text-[12px] text-muted-foreground">
                    No federal, state or local income tax is withheld. Social Security and Medicare still apply.
                  </p>
                </div>
              </div>
              <div className="flex justify-end">
                <Button
                  size="sm"
                  onClick={handleSaveTaxConfig}
                  disabled={taxSaving}
                  className="bg-brand-600 hover:bg-brand-700"
                >
                  <Save className="mr-1.5 size-3.5" />
                  {taxSaving ? "Saving..." : "Save Tax Config"}
                </Button>
              </div>
            </div>
          )}
        </Section>

        <div className="h-px bg-border" />

        {/* Leave Balances */}
        <Section title="Leave Balances" description="Current leave balance and usage for assigned policies.">
          {leaveBalances.length === 0 ? (
            <p className="text-sm text-muted-foreground">No leave balances found.</p>
          ) : (
            <div className="space-y-2">
              {leaveBalances.map((lb) => (
                <div
                  key={lb.id}
                  className="flex items-center justify-between rounded-md border px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <div>
                      <p className="text-sm font-medium">{lb.policy?.name || "-"}</p>
                      {lb.policy?.leaveType && (
                        <Badge variant="outline" className="mt-0.5 text-[11px]">
                          {lb.policy.leaveType}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-sm font-mono tabular-nums">
                    <div className="text-right">
                      <p className="text-[11px] font-sans text-muted-foreground">Balance</p>
                      <p>{lb.balance}h</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[11px] font-sans text-muted-foreground">Used</p>
                      <p>{lb.usedHours}h</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* Compensation Band */}
        {selectedBand && (
          <>
            <div className="h-px bg-border" />

            <Section title="Compensation Band" description="Salary band positioning for this employee.">
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="space-y-1">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Band</p>
                    <p className="text-sm font-medium">{selectedBand.level ? `${selectedBand.name} (${selectedBand.level})` : selectedBand.name}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Min Salary</p>
                    <p className="text-sm font-mono tabular-nums">{formatMoney(selectedBand.minSalary, selectedBand.currency || "USD")}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Mid Salary</p>
                    <p className="text-sm font-mono tabular-nums">{formatMoney(selectedBand.midSalary, selectedBand.currency || "USD")}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Max Salary</p>
                    <p className="text-sm font-mono tabular-nums">{formatMoney(selectedBand.maxSalary, selectedBand.currency || "USD")}</p>
                  </div>
                </div>
                {selectedBand.maxSalary > selectedBand.minSalary && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>Range Penetration</span>
                      <span className="font-mono tabular-nums">
                        {Math.min(
                          100,
                          Math.max(
                            0,
                            Math.round(
                              ((salaryInCents - selectedBand.minSalary) /
                                (selectedBand.maxSalary - selectedBand.minSalary)) *
                                100
                            )
                          )
                        )}
                        %
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-muted">
                      <div
                        className="h-2 rounded-full bg-brand-500 transition-all"
                        style={{
                          width: `${Math.min(
                            100,
                            Math.max(
                              0,
                              Math.round(
                                ((salaryInCents - selectedBand.minSalary) /
                                  (selectedBand.maxSalary - selectedBand.minSalary)) *
                                  100
                              )
                            )
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </Section>
          </>
        )}

        <div className="h-px bg-border" />

        {/* Save */}
        <div className="flex justify-end">
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving}
            className="bg-brand-600 hover:bg-brand-700"
          >
            <Save className="mr-1.5 size-3.5" />
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </div>

        <div className="h-px bg-border" />

        {/* Danger zone */}
        <Section title="Danger zone" description="Remove this employee from payroll.">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-md border border-red-200 bg-red-50 px-4 py-3 dark:border-red-900/50 dark:bg-red-950/20">
            <div>
              <p className="text-sm font-medium text-red-600 dark:text-red-400">Delete employee</p>
              <p className="text-[12px] text-muted-foreground">
                Remove this employee from payroll. Past pay runs and payslips keep their record.
              </p>
            </div>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDelete}
            >
              <Trash2 className="mr-1.5 size-3.5" />
              Delete
            </Button>
          </div>
        </Section>
      </div>

      {confirmDialog}
    </ContentReveal>
  );
}
