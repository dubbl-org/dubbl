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
        }
      })
      .finally(() => setLoading(false));
  }, [id, orgId]);

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
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <motion.div {...anim(0)} className="rounded-xl border bg-card p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Annual Salary</p>
          <p className="mt-1 text-2xl font-bold font-mono tabular-nums truncate">{formatMoney(salaryInCents)}</p>
        </motion.div>
        <motion.div {...anim(0.05)} className="rounded-xl border bg-card p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Per-Period Pay</p>
          <p className="mt-1 text-2xl font-bold font-mono tabular-nums truncate">{formatMoney(getPerPeriodPay(salaryInCents, payFrequency))}</p>
        </motion.div>
        <motion.div {...anim(0.09)} className="rounded-xl border bg-card p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Tax Rate</p>
          <p className="mt-1 text-2xl font-bold font-mono tabular-nums truncate">{taxRateNum}%</p>
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
          <div className="grid gap-4 sm:grid-cols-3">
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
