"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "motion/react";
import { toast } from "sonner";
import { ArrowLeft, Save, Trash2, Users, Power, PowerOff } from "lucide-react";
import { Section } from "@/components/dashboard/section";
import { Badge } from "@/components/ui/badge";
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
import { ContentReveal } from "@/components/ui/content-reveal";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { formatMoney } from "@/lib/money";
import { useConfirm } from "@/lib/hooks/use-confirm";
import { cn } from "@/lib/utils";

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

interface EmployeeDeduction {
  id: string;
  deductionType: { name: string; category: string; timing: string };
  amount: number;
  isPercentage: boolean;
  isActive: boolean;
}

interface TaxConfig {
  id: string;
  filingStatus: string;
  federalAllowances: number;
  stateAllowances: number;
  additionalFederalWithholding: number;
  additionalStateWithholding: number;
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
  minSalary: number;
  midSalary: number;
  maxSalary: number;
}

const anim = (delay: number) => ({
  initial: { opacity: 0, y: 12 } as const,
  animate: { opacity: 1, y: 0 } as const,
  transition: { duration: 0.3, delay } as const,
});

function getPerPeriodPay(salary: number, frequency: string): number {
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
  const [emp, setEmp] = useState<EmployeeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { confirm, dialog: confirmDialog } = useConfirm();

  // New section state
  const [deductions, setDeductions] = useState<EmployeeDeduction[]>([]);
  const [taxConfig, setTaxConfig] = useState<TaxConfig | null>(null);
  const [leaveBalances, setLeaveBalances] = useState<LeaveBalance[]>([]);
  const [compensationBand, setCompensationBand] = useState<CompensationBand | null>(null);
  const [taxSaving, setTaxSaving] = useState(false);

  // Tax config form state
  const [tcFilingStatus, setTcFilingStatus] = useState("");
  const [tcFederalAllowances, setTcFederalAllowances] = useState("0");
  const [tcStateAllowances, setTcStateAllowances] = useState("0");
  const [tcAddlFederal, setTcAddlFederal] = useState("0");
  const [tcAddlState, setTcAddlState] = useState("0");

  // Edit form state
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [employeeNumber, setEmployeeNumber] = useState("");
  const [position, setPosition] = useState("");
  const [salary, setSalary] = useState("");
  const [payFrequency, setPayFrequency] = useState("monthly");
  const [taxRate, setTaxRate] = useState("");
  const [bankAccountNumber, setBankAccountNumber] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [compensationType, setCompensationType] = useState("salary");
  const [hourlyRate, setHourlyRate] = useState("");

  const orgId =
    typeof window !== "undefined"
      ? localStorage.getItem("activeOrgId")
      : null;

  useEffect(() => {
    if (!orgId) return;
    fetch(`/api/v1/payroll/employees/${id}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.employee) {
          const e = data.employee;
          setEmp(e);
          setName(e.name);
          setEmail(e.email || "");
          setEmployeeNumber(e.employeeNumber);
          setPosition(e.position || "");
          setSalary((e.salary / 100).toFixed(2));
          setPayFrequency(e.payFrequency);
          setTaxRate((e.taxRate / 100).toFixed(2));
          setBankAccountNumber(e.bankAccountNumber || "");
          setStartDate(e.startDate || "");
          setEndDate(e.endDate || "");
          setIsActive(e.isActive);
          setCompensationType(e.compensationType || "salary");
          setHourlyRate(e.hourlyRate ? (e.hourlyRate / 100).toFixed(2) : "");
        }
      })
      .finally(() => setLoading(false));
  }, [id, orgId]);

  // Fetch deductions, tax config, leave balances, compensation band
  useEffect(() => {
    if (!orgId) return;
    const headers = { "x-organization-id": orgId };

    fetch(`/api/v1/payroll/employees/${id}/deductions`, { headers })
      .then((r) => r.json())
      .then((data) => {
        if (data.deductions) setDeductions(data.deductions);
      })
      .catch(() => {});

    fetch(`/api/v1/payroll/employees/${id}/tax-config`, { headers })
      .then((r) => r.json())
      .then((data) => {
        if (data.taxConfig) {
          const tc = data.taxConfig;
          setTaxConfig(tc);
          setTcFilingStatus(tc.filingStatus || "");
          setTcFederalAllowances(String(tc.federalAllowances ?? 0));
          setTcStateAllowances(String(tc.stateAllowances ?? 0));
          setTcAddlFederal(String(tc.additionalFederalWithholding ?? 0));
          setTcAddlState(String(tc.additionalStateWithholding ?? 0));
        }
      })
      .catch(() => {});

    fetch(`/api/v1/payroll/employees/${id}/leave-balances`, { headers })
      .then((r) => r.json())
      .then((data) => {
        if (data.leaveBalances) setLeaveBalances(data.leaveBalances);
      })
      .catch(() => {});
  }, [id, orgId]);

  // Fetch compensation band when employee loads
  useEffect(() => {
    if (!orgId || !emp?.compensationBandId) return;
    fetch(`/api/v1/payroll/compensation-bands/${emp.compensationBandId}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.band) setCompensationBand(data.band);
      })
      .catch(() => {});
  }, [orgId, emp?.compensationBandId]);

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
          additionalFederalWithholding: parseFloat(tcAddlFederal) || 0,
          additionalStateWithholding: parseFloat(tcAddlState) || 0,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.taxConfig) setTaxConfig(data.taxConfig);
        toast.success("Tax configuration updated");
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to update tax config");
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
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setEmp(data.employee);
        toast.success("Employee updated");
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to update");
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
      description: "This action cannot be undone.",
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
  const taxRateNum = parseFloat(taxRate || "0");

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
              ? "bg-emerald-50 dark:bg-emerald-950/40"
              : "bg-muted"
          )}>
            <Users className={cn(
              "size-5",
              isActive
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-muted-foreground"
            )} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold">{emp.name}</h1>
              <Badge variant="outline" className={
                isActive
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
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
                ? formatMoney(Math.round(parseFloat(hourlyRate || "0") * 100))
                : "-"}
          </p>
        </motion.div>
        <motion.div {...anim(0.05)} className="rounded-xl border bg-card p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Per-Period Pay</p>
          <p className="mt-1 text-2xl font-bold font-mono tabular-nums truncate">{formatMoney(getPerPeriodPay(salaryInCents, payFrequency))}</p>
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
              <Input
                type="number"
                step="0.01"
                value={salary}
                onChange={(e) => setSalary(e.target.value)}
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
                <Input type="number" step="0.01" value={hourlyRate} onChange={(e) => setHourlyRate(e.target.value)} />
              </div>
            )}
          </div>
        </Section>

        <div className="h-px bg-border" />

        {/* Details */}
        <Section title="Details" description="Banking and employment dates.">
          <div className="grid gap-4 sm:grid-cols-3">
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
        <Section title="Deductions" description="Assigned deductions for this employee. Manage deduction types in settings.">
          {deductions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No deductions assigned.</p>
          ) : (
            <div className="space-y-2">
              {deductions.map((d) => (
                <div
                  key={d.id}
                  className="flex items-center justify-between rounded-md border px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <div>
                      <p className="text-sm font-medium">{d.deductionType.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Badge variant="outline" className="text-[11px]">
                          {d.deductionType.category}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[11px]",
                            d.deductionType.timing === "pre_tax"
                              ? "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300"
                              : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300"
                          )}
                        >
                          {d.deductionType.timing === "pre_tax" ? "Pre-tax" : "Post-tax"}
                        </Badge>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-mono tabular-nums">
                      {d.isPercentage ? `${d.amount}%` : formatMoney(d.amount)}
                    </span>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[11px]",
                        d.isActive
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                          : ""
                      )}
                    >
                      {d.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
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
                      <SelectItem value="married_filing_jointly">Married Filing Jointly</SelectItem>
                      <SelectItem value="married_filing_separately">Married Filing Separately</SelectItem>
                      <SelectItem value="head_of_household">Head of Household</SelectItem>
                    </SelectContent>
                  </Select>
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
                  <Label className="text-xs">Additional Federal Withholding</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={tcAddlFederal}
                    onChange={(e) => setTcAddlFederal(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Additional State Withholding</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={tcAddlState}
                    onChange={(e) => setTcAddlState(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <Button
                  size="sm"
                  onClick={handleSaveTaxConfig}
                  disabled={taxSaving}
                  className="bg-emerald-600 hover:bg-emerald-700"
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
        {emp.compensationBandId && compensationBand && (
          <>
            <div className="h-px bg-border" />

            <Section title="Compensation Band" description="Salary band positioning for this employee.">
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="space-y-1">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Band</p>
                    <p className="text-sm font-medium">{compensationBand.name}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Min Salary</p>
                    <p className="text-sm font-mono tabular-nums">{formatMoney(compensationBand.minSalary)}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Mid Salary</p>
                    <p className="text-sm font-mono tabular-nums">{formatMoney(compensationBand.midSalary)}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Max Salary</p>
                    <p className="text-sm font-mono tabular-nums">{formatMoney(compensationBand.maxSalary)}</p>
                  </div>
                </div>
                {compensationBand.maxSalary > compensationBand.minSalary && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>Range Penetration</span>
                      <span className="font-mono tabular-nums">
                        {Math.min(
                          100,
                          Math.max(
                            0,
                            Math.round(
                              ((salaryInCents - compensationBand.minSalary) /
                                (compensationBand.maxSalary - compensationBand.minSalary)) *
                                100
                            )
                          )
                        )}
                        %
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-muted">
                      <div
                        className="h-2 rounded-full bg-emerald-500 transition-all"
                        style={{
                          width: `${Math.min(
                            100,
                            Math.max(
                              0,
                              Math.round(
                                ((salaryInCents - compensationBand.minSalary) /
                                  (compensationBand.maxSalary - compensationBand.minSalary)) *
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
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            <Save className="mr-1.5 size-3.5" />
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </div>

        <div className="h-px bg-border" />

        {/* Danger zone */}
        <Section title="Danger zone" description="Irreversible actions for this employee.">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-md border border-red-200 bg-red-50 px-4 py-3 dark:border-red-900/50 dark:bg-red-950/20">
            <div>
              <p className="text-sm font-medium text-red-600 dark:text-red-400">Delete employee</p>
              <p className="text-[12px] text-muted-foreground">
                Permanently delete this employee and all associated data.
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
