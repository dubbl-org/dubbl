"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "motion/react";
import { toast } from "sonner";
import { ArrowLeft, Save, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
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
import Link from "next/link";

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
      <ContentReveal className="space-y-6">
        <PageHeader title="Employee not found" />
        <Button variant="outline" size="sm" asChild>
          <Link href="/payroll/employees">
            <ArrowLeft className="mr-2 size-4" />
            Back to Employees
          </Link>
        </Button>
      </ContentReveal>
    );
  }

  const salaryInCents = Math.round(parseFloat(salary || "0") * 100);
  const taxRateNum = parseFloat(taxRate || "0");

  return (
    <ContentReveal className="space-y-6">
      <PageHeader
        title={`${emp.employeeNumber} · ${emp.name}`}
        description={emp.position || undefined}
      >
        <Button variant="outline" size="sm" asChild>
          <Link href="/payroll/employees">
            <ArrowLeft className="mr-2 size-4" />
            Back
          </Link>
        </Button>
        <Button
          size="sm"
          onClick={handleSave}
          disabled={saving}
          className="bg-emerald-600 hover:bg-emerald-700"
        >
          <Save className="mr-2 size-4" />
          {saving ? "Saving..." : "Save Changes"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleDelete}
          className="text-red-600"
        >
          <Trash2 className="mr-2 size-4" />
          Delete
        </Button>
      </PageHeader>

      <div className="flex flex-wrap items-center gap-2">
        <Badge
          variant="outline"
          className={
            isActive
              ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
              : "border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300"
          }
        >
          {isActive ? "Active" : "Inactive"}
        </Badge>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={() => setIsActive(!isActive)}
        >
          {isActive ? "Set Inactive" : "Set Active"}
        </Button>
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
        <div className="rounded-xl border bg-card p-4 sm:p-5 space-y-4">
          <h3 className="text-sm font-semibold">Personal Info</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Full Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Employee #</Label>
              <Input
                value={employeeNumber}
                onChange={(e) => setEmployeeNumber(e.target.value)}
                disabled
              />
            </div>
            <div className="space-y-2">
              <Label>Position</Label>
              <Input
                value={position}
                onChange={(e) => setPosition(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Compensation */}
        <div className="rounded-xl border bg-card p-4 sm:p-5 space-y-4">
          <h3 className="text-sm font-semibold">Compensation</h3>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label>Annual Salary</Label>
              <Input
                type="number"
                step="0.01"
                value={salary}
                onChange={(e) => setSalary(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Pay Frequency</Label>
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
            <div className="space-y-2">
              <Label>Tax Rate (%)</Label>
              <Input
                type="number"
                step="0.01"
                value={taxRate}
                onChange={(e) => setTaxRate(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Details */}
        <div className="rounded-xl border bg-card p-4 sm:p-5 space-y-4">
          <h3 className="text-sm font-semibold">Details</h3>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label>Bank Account Number</Label>
              <Input
                value={bankAccountNumber}
                onChange={(e) => setBankAccountNumber(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Start Date</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                disabled
              />
            </div>
            <div className="space-y-2">
              <Label>End Date</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                disabled
              />
            </div>
          </div>
        </div>
      </div>

      {confirmDialog}
    </ContentReveal>
  );
}
